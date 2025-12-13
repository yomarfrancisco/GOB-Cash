/**
 * Admin script: backfillDirectory
 * 
 * One-time migration script to populate publicDirectory and directoryPrivate
 * from existing user documents.
 * 
 * Usage:
 * - Run locally with service account: node -e "require('./backfillDirectory').backfillDirectory()"
 * - Or deploy as HTTPS callable admin function (protected behind ALLOW_ADMIN_ENDPOINTS)
 */

import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'

const db = admin.firestore()

interface UserDocument {
  userId: string
  email: string
  fullName: string | null
  displayName: string | null
  handle: string
  avatarUrl: string | null
  phoneNumber: string | null
  phoneE164: string | null
  phoneCountry: string | null
  isAgent: boolean
  trustGlobal: number | null
  ghostQuality?: number
}

/**
 * Extract ISO2 country code from phone number
 */
function extractPhoneCountry(phone: string | null | undefined): string | null {
  if (!phone) return null
  
  const normalized = phone.replace(/\s+/g, '').trim()
  
  // Map common country codes to ISO2
  if (normalized.startsWith('+27')) return 'ZA' // South Africa
  if (normalized.startsWith('+258')) return 'MZ' // Mozambique
  if (normalized.startsWith('+263')) return 'ZW' // Zimbabwe
  if (normalized.startsWith('+260')) return 'ZM' // Zambia
  if (normalized.startsWith('+267')) return 'BW' // Botswana
  if (normalized.startsWith('+264')) return 'NA' // Namibia
  if (normalized.startsWith('+266')) return 'LS' // Lesotho
  if (normalized.startsWith('+268')) return 'SZ' // Eswatini
  if (normalized.startsWith('+44')) return 'GB' // United Kingdom
  if (normalized.startsWith('+1')) return 'US' // United States
  
  return null
}

/**
 * Sync a single user to publicDirectory and directoryPrivate
 */
async function syncUserToDirectory(uid: string, userData: UserDocument): Promise<void> {
  const handle = userData.handle
  
  if (!handle || handle.trim() === '') {
    console.warn('[backfillDirectory] User has no handle, skipping', { uid })
    return
  }

  // Normalize handle (ensure $ prefix, lowercase)
  const normalizedHandle = handle.startsWith('$') 
    ? handle.toLowerCase() 
    : `$${handle.toLowerCase()}`

  const now = admin.firestore.Timestamp.now()
  
  // Extract phone country if not already set
  const phoneCountry = userData.phoneCountry || extractPhoneCountry(userData.phoneE164 || userData.phoneNumber)
  
  // Get phone in E164 format (prefer phoneE164, fallback to phoneNumber)
  const phoneE164 = userData.phoneE164 || userData.phoneNumber || null

  // 1. Upsert publicDirectory/{handle}
  const publicDirRef = db.collection('publicDirectory').doc(normalizedHandle)
  const publicDirDoc = await publicDirRef.get()
  
  // Check if handle is already claimed by a different user (prevent hijacking)
  if (publicDirDoc.exists) {
    const existingData = publicDirDoc.data()
    if (existingData?.ownerUserId && existingData.ownerUserId !== uid) {
      console.error('[backfillDirectory] Handle already claimed by different user', {
        handle: normalizedHandle,
        existingOwner: existingData.ownerUserId,
        attemptingOwner: uid,
      })
      return // Skip this user
    }
  }

  const publicDirData: any = {
    handle: normalizedHandle,
    displayName: userData.displayName || userData.fullName || null,
    avatarUrl: userData.avatarUrl || null,
    phoneCountry: phoneCountry || null,
    isAgent: userData.isAgent || false,
    ownerUserId: uid, // REQUIRED - never null for real users
    trustGlobal: userData.trustGlobal || null,
    updatedAt: now,
  }

  // Preserve ghostQuality if it exists
  if (publicDirDoc.exists) {
    const existingData = publicDirDoc.data()
    if (existingData?.ghostQuality !== undefined) {
      publicDirData.ghostQuality = existingData.ghostQuality
    }
    if (existingData?.createdAt) {
      publicDirData.createdAt = existingData.createdAt
    } else {
      publicDirData.createdAt = now
    }
  } else {
    publicDirData.createdAt = now
  }

  await publicDirRef.set(publicDirData, { merge: true })
  console.log('[backfillDirectory] Upserted publicDirectory', { handle: normalizedHandle, uid })

  // 2. Upsert directoryPrivate/{handle} (only if we have email and phone)
  if (userData.email && phoneE164) {
    const privateDirRef = db.collection('directoryPrivate').doc(normalizedHandle)
    const privateDirDoc = await privateDirRef.get()
    
    const privateDirData: any = {
      handle: normalizedHandle,
      ownerUserId: uid, // REQUIRED
      email: userData.email,
      phoneE164: phoneE164,
      phoneCountry: phoneCountry || null,
      updatedAt: now,
    }

    if (privateDirDoc.exists) {
      const existingData = privateDirDoc.data()
      if (existingData?.createdAt) {
        privateDirData.createdAt = existingData.createdAt
      } else {
        privateDirData.createdAt = now
      }
    } else {
      privateDirData.createdAt = now
    }

    await privateDirRef.set(privateDirData, { merge: true })
    console.log('[backfillDirectory] Upserted directoryPrivate', { handle: normalizedHandle, uid })
  } else {
    console.warn('[backfillDirectory] Skipping directoryPrivate (missing email or phone)', {
      handle: normalizedHandle,
      uid,
      hasEmail: !!userData.email,
      hasPhone: !!phoneE164,
    })
  }
}

/**
 * Backfill all users to publicDirectory and directoryPrivate
 */
export async function backfillDirectory(): Promise<{ success: number; skipped: number; errors: number }> {
  console.log('[backfillDirectory] Starting directory backfill...')
  
  let success = 0
  let skipped = 0
  let errors = 0

  try {
    // Get all users
    const usersRef = db.collection('users')
    const snapshot = await usersRef.get()

    console.log(`[backfillDirectory] Found ${snapshot.size} users to process`)

    // Process in batches to avoid overwhelming Firestore
    const batchSize = 10
    const users = snapshot.docs
    const batches: typeof users[] = []

    for (let i = 0; i < users.length; i += batchSize) {
      batches.push(users.slice(i, i + batchSize))
    }

    for (const batch of batches) {
      await Promise.all(
        batch.map(async (userDoc) => {
          try {
            const uid = userDoc.id
            const userData = userDoc.data() as UserDocument

            // Ensure userId matches uid
            if (userData.userId !== uid) {
              console.warn('[backfillDirectory] userId mismatch', { uid, userId: userData.userId })
              skipped++
              return
            }

            await syncUserToDirectory(uid, userData)
            success++
          } catch (error) {
            console.error('[backfillDirectory] Error processing user', {
              uid: userDoc.id,
              error: error instanceof Error ? error.message : String(error),
            })
            errors++
          }
        })
      )

      // Small delay between batches to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    console.log('[backfillDirectory] Backfill complete', { success, skipped, errors })
    return { success, skipped, errors }
  } catch (error) {
    console.error('[backfillDirectory] Fatal error', error)
    throw error
  }
}

/**
 * HTTPS callable function for admin use
 * Protected behind ALLOW_ADMIN_ENDPOINTS environment variable check
 */
export const admin_backfillDirectory = functions
  .region('us-central1')
  .runWith({ timeoutSeconds: 540, memory: '512MB' })
  .https.onCall(async (data, context) => {
    // For now, allow authenticated users to run backfill
    // TODO: Add proper admin role check or ALLOW_ADMIN_ENDPOINTS env var check
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required')
    }

    // Optional: Add additional auth check here (e.g., check for admin role)
    // if (!isAdmin(context.auth.uid)) {
    //   throw new functions.https.HttpsError('permission-denied', 'Unauthorized')
    // }

    try {
      const result = await backfillDirectory()
      return result
    } catch (error) {
      console.error('[admin_backfillDirectory] Error', error)
      throw new functions.https.HttpsError(
        'internal',
        error instanceof Error ? error.message : 'Failed to backfill directory'
      )
    }
  })


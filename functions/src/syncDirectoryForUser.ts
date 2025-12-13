/**
 * Cloud Function: syncDirectoryForUser
 * 
 * Syncs user data to publicDirectory and directoryPrivate collections.
 * 
 * Triggers:
 * - firestore.document('users/{uid}').onWrite
 * - Also available as callable directory_syncMyRecord for admin/debug
 * 
 * Behavior:
 * - Reads /users/{uid} to get handle, displayName, email, phone, etc.
 * - Upserts /publicDirectory/{handle} with non-sensitive fields + ownerUserId
 * - Upserts /directoryPrivate/{handle} with email + phoneE164 + ownerUserId
 * - Ensures ownerUserId is never null for real users
 * - Handles handle changes (migrates old handle doc, creates new one)
 */

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

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
 * Sync user data to publicDirectory and directoryPrivate
 */
async function syncUserToDirectory(uid: string, userData: UserDocument): Promise<void> {
  const handle = userData.handle
  
  if (!handle || handle.trim() === '') {
    console.warn('[syncDirectoryForUser] User has no handle, skipping', { uid })
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
  
  if (!phoneE164) {
    console.warn('[syncDirectoryForUser] User has no phone number, directoryPrivate will be incomplete', { uid, handle: normalizedHandle })
  }

  // 1. Upsert publicDirectory/{handle}
  const publicDirRef = db.collection('publicDirectory').doc(normalizedHandle)
  const publicDirDoc = await publicDirRef.get()
  
  // Check if handle is already claimed by a different user (prevent hijacking)
  if (publicDirDoc.exists) {
    const existingData = publicDirDoc.data()
    if (existingData?.ownerUserId && existingData.ownerUserId !== uid) {
      console.error('[syncDirectoryForUser] Handle already claimed by different user', {
        handle: normalizedHandle,
        existingOwner: existingData.ownerUserId,
        attemptingOwner: uid,
      })
      throw new Error(`Handle ${normalizedHandle} is already claimed by another user`)
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

  // Preserve ghostQuality if it exists (computed by scheduled function)
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
  console.log('[syncDirectoryForUser] Upserted publicDirectory', { handle: normalizedHandle, uid })

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
    console.log('[syncDirectoryForUser] Upserted directoryPrivate', { handle: normalizedHandle, uid })
  } else {
    console.warn('[syncDirectoryForUser] Skipping directoryPrivate (missing email or phone)', {
      handle: normalizedHandle,
      uid,
      hasEmail: !!userData.email,
      hasPhone: !!phoneE164,
    })
  }
}

/**
 * Handle handle change - migrate old handle doc, create new one
 */
async function handleHandleChange(
  uid: string,
  oldHandle: string | null,
  newHandle: string,
  userData: UserDocument
): Promise<void> {
  if (!oldHandle || oldHandle === newHandle) {
    return // No migration needed
  }

  const oldNormalized = oldHandle.startsWith('$') 
    ? oldHandle.toLowerCase() 
    : `$${oldHandle.toLowerCase()}`
  
  const newNormalized = newHandle.startsWith('$') 
    ? newHandle.toLowerCase() 
    : `$${newHandle.toLowerCase()}`

  if (oldNormalized === newNormalized) {
    return // Same after normalization
  }

  console.log('[syncDirectoryForUser] Handle changed, migrating', {
    uid,
    oldHandle: oldNormalized,
    newHandle: newNormalized,
  })

  // Check if old handle doc exists and is owned by this user
  const oldPublicRef = db.collection('publicDirectory').doc(oldNormalized)
  const oldPublicDoc = await oldPublicRef.get()
  
  if (oldPublicDoc.exists) {
    const oldData = oldPublicDoc.data()
    if (oldData?.ownerUserId === uid) {
      // Optionally: tombstone old handle (set ownerUserId to null or delete)
      // For now, we'll leave it but log a warning
      console.warn('[syncDirectoryForUser] Old handle doc still exists', {
        oldHandle: oldNormalized,
        uid,
      })
    }
  }

  // Create new handle docs (syncUserToDirectory will handle this)
  await syncUserToDirectory(uid, userData)
}

/**
 * Firestore trigger: onUserWrite
 * Triggers when /users/{uid} is created or updated
 */
export const onUserWrite = functions.firestore
  .document('users/{uid}')
  .onWrite(async (change, context) => {
    const uid = context.params.uid
    
    const before = change.before.exists ? change.before.data() as UserDocument : null
    const after = change.after.exists ? change.after.data() as UserDocument : null

    // Handle deletion: optionally clean up directory entries
    if (!after && before) {
      console.log('[onUserWrite] User deleted, skipping directory sync', { uid })
      return null
    }

    if (!after) {
      console.warn('[onUserWrite] User missing after write', { uid })
      return null
    }

    // Ensure userId matches uid
    if (after.userId !== uid) {
      console.error('[onUserWrite] userId mismatch', { uid, userId: after.userId })
      return null
    }

    try {
      // Check if handle changed
      const oldHandle = before?.handle || null
      const newHandle = after.handle

      if (oldHandle && oldHandle !== newHandle) {
        // Handle migration
        await handleHandleChange(uid, oldHandle, newHandle, after)
      } else {
        // Normal sync
        await syncUserToDirectory(uid, after)
      }

      console.log('[onUserWrite] Successfully synced user to directory', { uid, handle: newHandle })
    } catch (error) {
      console.error('[onUserWrite] Failed to sync user to directory', {
        uid,
        error: error instanceof Error ? error.message : String(error),
      })
      // Don't throw - allow user write to succeed even if directory sync fails
    }

    return null
  })

/**
 * Callable function: directory_syncMyRecord
 * Allows users to manually trigger directory sync (admin/debug)
 */
export const directory_syncMyRecord = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required')
    }

    const uid = context.auth.uid

    try {
      // Read user document
      const userRef = db.collection('users').doc(uid)
      const userDoc = await userRef.get()

      if (!userDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'User document not found')
      }

      const userData = userDoc.data() as UserDocument
      
      // Sync to directory
      await syncUserToDirectory(uid, userData)

      return { success: true, handle: userData.handle }
    } catch (error) {
      console.error('[directory_syncMyRecord] Failed', { uid, error })
      throw new functions.https.HttpsError(
        'internal',
        error instanceof Error ? error.message : 'Failed to sync directory'
      )
    }
  })


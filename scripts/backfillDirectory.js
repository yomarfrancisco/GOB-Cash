/**
 * Backfill script to populate /publicDirectory and /directoryPrivate from /users
 * 
 * Usage:
 *   node scripts/backfillDirectory.js
 * 
 * Requires:
 *   - Firebase Admin SDK initialized
 *   - Application Default Credentials (firebase login) OR service account JSON
 */

const admin = require('firebase-admin')

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    // Try Application Default Credentials first (works with firebase login)
    admin.initializeApp({
      projectId: 'gobankless-dev'
    })
    console.log('[backfill] Using Application Default Credentials')
  } catch (error) {
    // Fallback to service account if available
    try {
      const serviceAccount = require('../functions/serviceAccountKey.json')
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: 'gobankless-dev'
      })
      console.log('[backfill] Using service account key')
    } catch (err) {
      console.error('[backfill] Failed to initialize Firebase Admin')
      console.error('Either run: firebase login')
      console.error('Or set: GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json')
      process.exit(1)
    }
  }
}

const db = admin.firestore()

/**
 * Extract ISO2 country code from phone number
 */
function extractPhoneCountry(phone) {
  if (!phone) return null
  
  const normalized = phone.replace(/\s+/g, '').trim()
  
  if (normalized.startsWith('+27')) return 'ZA'
  if (normalized.startsWith('+258')) return 'MZ'
  if (normalized.startsWith('+263')) return 'ZW'
  if (normalized.startsWith('+260')) return 'ZM'
  if (normalized.startsWith('+267')) return 'BW'
  if (normalized.startsWith('+264')) return 'NA'
  if (normalized.startsWith('+266')) return 'LS'
  if (normalized.startsWith('+268')) return 'SZ'
  if (normalized.startsWith('+44')) return 'GB'
  if (normalized.startsWith('+1')) return 'US'
  
  return null
}

/**
 * Sync a single user to publicDirectory and directoryPrivate
 */
async function syncUserToDirectory(uid, userData) {
  const handle = userData.handle
  
  if (!handle || handle.trim() === '') {
    return { skipped: true, reason: 'no handle' }
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
      console.warn(`[backfill] Handle ${normalizedHandle} already claimed by ${existingData.ownerUserId}, skipping ${uid}`)
      return { skipped: true, reason: 'handle claimed' }
    }
  }

  const publicDirData = {
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
  console.log(`[backfill] ✅ publicDirectory/${normalizedHandle}`)

  // 2. Upsert directoryPrivate/{handle} (only if we have email and phone)
  if (userData.email && phoneE164) {
    const privateDirRef = db.collection('directoryPrivate').doc(normalizedHandle)
    const privateDirDoc = await privateDirRef.get()
    
    const privateDirData = {
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
    console.log(`[backfill] ✅ directoryPrivate/${normalizedHandle}`)
    return { success: true }
  } else {
    console.log(`[backfill] ⚠️  directoryPrivate/${normalizedHandle} skipped (missing email or phone)`)
    return { success: true, privateSkipped: true }
  }
}

/**
 * Backfill all users to publicDirectory and directoryPrivate
 */
async function backfillDirectory() {
  console.log('[backfill] Starting directory backfill...\n')
  
  let success = 0
  let skipped = 0
  let errors = 0
  let privateSkipped = 0

  try {
    // Get all users
    const usersRef = db.collection('users')
    const snapshot = await usersRef.get()

    console.log(`[backfill] Found ${snapshot.size} users to process\n`)

    if (snapshot.size === 0) {
      console.log('[backfill] No users found. Exiting.')
      return { success: 0, skipped: 0, errors: 0 }
    }

    // Process in batches to avoid overwhelming Firestore
    const batchSize = 10
    const users = snapshot.docs
    const batches = []

    for (let i = 0; i < users.length; i += batchSize) {
      batches.push(users.slice(i, i + batchSize))
    }

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx]
      console.log(`[backfill] Processing batch ${batchIdx + 1}/${batches.length} (${batch.length} users)...`)

      await Promise.all(
        batch.map(async (userDoc) => {
          try {
            const uid = userDoc.id
            const userData = userDoc.data()

            // Ensure userId matches uid
            if (userData.userId !== uid) {
              console.warn(`[backfill] ⚠️  userId mismatch: ${uid} vs ${userData.userId}`)
              skipped++
              return
            }

            const result = await syncUserToDirectory(uid, userData)
            
            if (result.skipped) {
              skipped++
            } else if (result.success) {
              success++
              if (result.privateSkipped) {
                privateSkipped++
              }
            }
          } catch (error) {
            console.error(`[backfill] ❌ Error processing user ${userDoc.id}:`, error.message)
            errors++
          }
        })
      )

      // Small delay between batches to avoid rate limiting
      if (batchIdx < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    console.log('\n[backfill] Backfill complete')
    console.log(`  ✅ Success: ${success}`)
    console.log(`  ⚠️  Skipped: ${skipped}`)
    console.log(`  ❌ Errors: ${errors}`)
    console.log(`  📝 Note: ${privateSkipped} users synced to publicDirectory but skipped directoryPrivate (missing email/phone)`)
    
    return { success, skipped, errors, privateSkipped }
  } catch (error) {
    console.error('[backfill] Fatal error:', error)
    throw error
  }
}

// Run if called directly
if (require.main === module) {
  backfillDirectory()
    .then(result => {
      console.log('\n✅ Backfill completed:', result)
      process.exit(0)
    })
    .catch(error => {
      console.error('\n❌ Backfill failed:', error)
      process.exit(1)
    })
}

module.exports = { backfillDirectory, syncUserToDirectory }


/**
 * Script to run directory backfill
 * 
 * Usage:
 *   node scripts/runBackfill.js
 * 
 * Requires:
 *   - Firebase Admin SDK initialized
 *   - Service account credentials (via GOOGLE_APPLICATION_CREDENTIALS env var)
 *   OR
 *   - Firebase CLI authenticated (firebase login)
 */

const admin = require('firebase-admin')

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'gobankless-dev'
  })
}

const db = admin.firestore()

async function extractPhoneCountry(phone) {
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

async function syncUserToDirectory(uid, userData) {
  const handle = userData.handle
  
  if (!handle || handle.trim() === '') {
    console.warn('[backfill] User has no handle, skipping', { uid })
    return
  }

  const normalizedHandle = handle.startsWith('$') 
    ? handle.toLowerCase() 
    : `$${handle.toLowerCase()}`

  const now = admin.firestore.Timestamp.now()
  const phoneCountry = userData.phoneCountry || extractPhoneCountry(userData.phoneE164 || userData.phoneNumber)
  const phoneE164 = userData.phoneE164 || userData.phoneNumber || null

  // Upsert publicDirectory
  const publicDirRef = db.collection('publicDirectory').doc(normalizedHandle)
  const publicDirDoc = await publicDirRef.get()
  
  if (publicDirDoc.exists) {
    const existingData = publicDirDoc.data()
    if (existingData?.ownerUserId && existingData.ownerUserId !== uid) {
      console.error('[backfill] Handle already claimed', { handle: normalizedHandle, existingOwner: existingData.ownerUserId, attemptingOwner: uid })
      return
    }
  }

  const publicDirData = {
    handle: normalizedHandle,
    displayName: userData.displayName || userData.fullName || null,
    avatarUrl: userData.avatarUrl || null,
    phoneCountry: phoneCountry || null,
    isAgent: userData.isAgent || false,
    ownerUserId: uid,
    trustGlobal: userData.trustGlobal || null,
    updatedAt: now,
  }

  if (publicDirDoc.exists) {
    const existingData = publicDirDoc.data()
    if (existingData?.ghostQuality !== undefined) {
      publicDirData.ghostQuality = existingData.ghostQuality
    }
    publicDirData.createdAt = existingData?.createdAt || now
  } else {
    publicDirData.createdAt = now
  }

  await publicDirRef.set(publicDirData, { merge: true })
  console.log('[backfill] Upserted publicDirectory', { handle: normalizedHandle, uid })

  // Upsert directoryPrivate
  if (userData.email && phoneE164) {
    const privateDirRef = db.collection('directoryPrivate').doc(normalizedHandle)
    const privateDirDoc = await privateDirRef.get()
    
    const privateDirData = {
      handle: normalizedHandle,
      ownerUserId: uid,
      email: userData.email,
      phoneE164: phoneE164,
      phoneCountry: phoneCountry || null,
      updatedAt: now,
      createdAt: privateDirDoc.exists ? (privateDirDoc.data()?.createdAt || now) : now,
    }

    await privateDirRef.set(privateDirData, { merge: true })
    console.log('[backfill] Upserted directoryPrivate', { handle: normalizedHandle, uid })
  } else {
    console.warn('[backfill] Skipping directoryPrivate (missing email or phone)', { handle: normalizedHandle, uid, hasEmail: !!userData.email, hasPhone: !!phoneE164 })
  }
}

async function backfillDirectory() {
  console.log('[backfill] Starting directory backfill...')
  
  let success = 0
  let skipped = 0
  let errors = 0

  try {
    const usersRef = db.collection('users')
    const snapshot = await usersRef.get()

    console.log(`[backfill] Found ${snapshot.size} users to process`)

    const batchSize = 10
    const users = snapshot.docs
    const batches = []

    for (let i = 0; i < users.length; i += batchSize) {
      batches.push(users.slice(i, i + batchSize))
    }

    for (const batch of batches) {
      await Promise.all(
        batch.map(async (userDoc) => {
          try {
            const uid = userDoc.id
            const userData = userDoc.data()

            if (userData.userId !== uid) {
              console.warn('[backfill] userId mismatch', { uid, userId: userData.userId })
              skipped++
              return
            }

            await syncUserToDirectory(uid, userData)
            success++
          } catch (error) {
            console.error('[backfill] Error processing user', {
              uid: userDoc.id,
              error: error.message,
            })
            errors++
          }
        })
      )

      await new Promise(resolve => setTimeout(resolve, 100))
    }

    console.log('[backfill] Backfill complete', { success, skipped, errors })
    return { success, skipped, errors }
  } catch (error) {
    console.error('[backfill] Fatal error', error)
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

module.exports = { backfillDirectory }


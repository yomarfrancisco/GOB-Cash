/**
 * Backfill script to populate /globalContactsPublic and /globalContactsPrivate
 * from all users in /users/{uid}
 * 
 * Usage:
 *   node scripts/backfillUsersToGlobalContacts.js
 * 
 * Requires:
 *   - Service account JSON file (auto-detected)
 */

const admin = require('firebase-admin')
const path = require('path')
const fs = require('fs')

// Initialize Firebase Admin with service account
if (!admin.apps.length) {
  let serviceAccountPath = null
  let serviceAccount = null

  // 1. Check GOOGLE_APPLICATION_CREDENTIALS env var
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
    console.log(`[backfill] Using service account from GOOGLE_APPLICATION_CREDENTIALS: ${serviceAccountPath}`)
  } else {
    // 2. Check common locations in order
    const possiblePaths = [
      path.join(__dirname, '..', 'gobankless-dev-firebase-adminsdk-fbsvc-f9e7a2ca07.json'), // Repo root
      path.join(__dirname, '..', 'functions', 'serviceAccountKey.json'), // Functions directory
    ]
    
    for (const possiblePath of possiblePaths) {
      if (fs.existsSync(possiblePath)) {
        serviceAccountPath = possiblePath
        console.log(`[backfill] Found service account at: ${serviceAccountPath}`)
        break
      }
    }
    
    if (!serviceAccountPath) {
      console.error(`[backfill] ❌ Service account file not found in any of these locations:`)
      possiblePaths.forEach(p => console.error(`  - ${p}`))
      console.error('')
      console.error('Please either:')
      console.error('  1. Place service account JSON in one of the locations above')
      console.error('  2. Or set: export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json')
      process.exit(1)
    }
  }

  try {
    serviceAccount = require(serviceAccountPath)
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: 'gobankless-dev'
    })
    console.log(`[backfill] ✅ Initialized Firebase Admin with service account`)
  } catch (error) {
    console.error(`[backfill] ❌ Failed to load service account from ${serviceAccountPath}:`, error.message)
    process.exit(1)
  }
}

const db = admin.firestore()

/**
 * Normalize handle to canonical format: $prefix + lowercase, remove @ symbols
 */
function normalizeHandle(handle) {
  if (!handle) return null
  let h = handle.trim()
  if (!h) return null
  
  // Remove all @ symbols (they're not part of the canonical format)
  h = h.replace(/@/g, '')
  
  // Ensure $ prefix
  if (!h.startsWith('$')) {
    h = `$${h}`
  }
  
  return h.toLowerCase()
}

/**
 * Check if displayName looks generic (e.g., "User 8513")
 */
function isGenericDisplayName(displayName) {
  if (!displayName) return false
  return /^User\s+\d+$/i.test(displayName.trim())
}

/**
 * Sync a single user to globalContactsPublic and globalContactsPrivate
 */
async function syncUserToGlobalContacts(uid, userData) {
  const handle = userData.handle
  
  if (!handle || handle.trim() === '') {
    return { skipped: true, reason: 'no handle' }
  }

  // Normalize handle (strip @, ensure $ prefix, lowercase)
  const normalizedHandle = normalizeHandle(handle)
  if (!normalizedHandle) {
    return { skipped: true, reason: 'invalid handle' }
  }

  const now = admin.firestore.Timestamp.now()

  // 1. Upsert globalContactsPublic
  const publicRef = db.collection('globalContactsPublic').doc(normalizedHandle)
  const publicDoc = await publicRef.get()

  const publicData = {
    handle: normalizedHandle,
    updatedAt: now,
  }

  if (publicDoc.exists) {
    const existingData = publicDoc.data()
    
    // displayName: if incoming user has a value and existing looks generic, overwrite; otherwise use latest-updated wins
    const userDisplayName = userData.displayName || userData.fullName
    if (userDisplayName) {
      const existingDisplayName = existingData?.displayName
      if (isGenericDisplayName(existingDisplayName) || !existingDisplayName) {
        publicData.displayName = userDisplayName
      } else {
        // Use latest-updated wins (for now, prefer user's displayName if it exists)
        publicData.displayName = userDisplayName
      }
    } else if (existingData?.displayName) {
      publicData.displayName = existingData.displayName
    }

    // avatarUrl: if incoming user has a real value, overwrite existing
    if (userData.avatarUrl) {
      publicData.avatarUrl = userData.avatarUrl
    } else if (existingData?.avatarUrl) {
      publicData.avatarUrl = existingData.avatarUrl
    }

    // sources: union existing + "signup" (to distinguish from "device" contacts)
    const existingSources = new Set(existingData?.sources || [])
    existingSources.add('signup')
    publicData.sources = Array.from(existingSources)

    if (existingData?.createdAt) {
      publicData.createdAt = existingData.createdAt
    } else {
      publicData.createdAt = now
    }

    await publicRef.update(publicData)
    console.log(`[backfill] ✅ Updated globalContactsPublic/${normalizedHandle}`)
  } else {
    // New entry
    publicData.displayName = userData.displayName || userData.fullName || null
    publicData.avatarUrl = userData.avatarUrl || null
    publicData.sources = ['signup']
    publicData.createdAt = now
    await publicRef.set(publicData)
    console.log(`[backfill] ✅ Created globalContactsPublic/${normalizedHandle}`)
  }

  // 2. Upsert globalContactsPrivate (only if we have email or phone)
  const userEmail = userData.email?.trim() || ''
  const userPhone = userData.phoneE164 || userData.phoneNumber || null
  const normalizedPhone = userPhone ? userPhone.replace(/\s+/g, '').trim() : null

  if (userEmail || normalizedPhone) {
    const privateRef = db.collection('globalContactsPrivate').doc(normalizedHandle)
    const privateDoc = await privateRef.get()

    const privateData = {
      handle: normalizedHandle,
      updatedAt: now,
    }

    if (privateDoc.exists) {
      const existingData = privateDoc.data()

      // primaryEmail: from user email only if non-empty, never overwrite existing with empty
      if (userEmail) {
        privateData.primaryEmail = userEmail
      } else if (existingData?.primaryEmail) {
        privateData.primaryEmail = existingData.primaryEmail
      }

      // primaryPhone: from user phoneNumber only if non-empty, never overwrite existing with empty
      if (normalizedPhone) {
        privateData.primaryPhone = normalizedPhone
      } else if (existingData?.primaryPhone) {
        privateData.primaryPhone = existingData.primaryPhone
      }

      if (existingData?.createdAt) {
        privateData.createdAt = existingData.createdAt
      } else {
        privateData.createdAt = now
      }

      await privateRef.update(privateData)
      const fields = []
      if (userEmail) fields.push('email')
      if (normalizedPhone) fields.push('phone')
      console.log(`[backfill] ✅ Updated globalContactsPrivate/${normalizedHandle} (${fields.join(' + ')})`)
    } else {
      // New entry
      if (userEmail) {
        privateData.primaryEmail = userEmail
      }
      if (normalizedPhone) {
        privateData.primaryPhone = normalizedPhone
      }
      privateData.createdAt = now
      await privateRef.set(privateData)
      const fields = []
      if (userEmail) fields.push('email')
      if (normalizedPhone) fields.push('phone')
      console.log(`[backfill] ✅ Created globalContactsPrivate/${normalizedHandle} (${fields.join(' + ')})`)
    }
    return { success: true }
  } else {
    console.log(`[backfill] ⚠️  globalContactsPrivate/${normalizedHandle} skipped (missing both email and phone)`)
    return { success: true, privateSkipped: true }
  }
}

/**
 * Backfill all users to globalContacts
 */
async function backfillUsersToGlobalContacts() {
  console.log('[backfill] Starting users to globalContacts backfill...\n')
  
  let totalScanned = 0
  let skipped = 0
  let publicCreated = 0
  let publicUpdated = 0
  let privateCreated = 0
  let privateUpdated = 0
  let privateSkipped = 0

  try {
    const usersRef = db.collection('users')
    
    // Process in batches with pagination
    let lastDoc = null
    let hasMore = true
    const batchSize = 10 // Process 10 users in parallel
    const fetchSize = 100 // Fetch 100 at a time

    while (hasMore) {
      // Build query with pagination
      let query = usersRef.orderBy(admin.firestore.FieldPath.documentId()).limit(fetchSize)
      
      if (lastDoc) {
        query = query.startAfter(lastDoc)
      }

      const snapshot = await query.get()
      const users = snapshot.docs
      
      if (users.length === 0) {
        hasMore = false
        break
      }

      totalScanned += users.length
      console.log(`[backfill] Fetched batch of ${users.length} users (total scanned: ${totalScanned})`)

      // Process in smaller parallel batches
      for (let i = 0; i < users.length; i += batchSize) {
        const batch = users.slice(i, i + batchSize)
        console.log(`[backfill] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(users.length / batchSize)} (${batch.length} users)...`)

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

              const result = await syncUserToGlobalContacts(uid, userData)
              
              if (result.skipped) {
                skipped++
              } else if (result.success) {
                // Check if it was created or updated by checking if doc existed before
                const handle = normalizeHandle(userData.handle)
                if (handle) {
                  const publicRef = db.collection('globalContactsPublic').doc(handle)
                  const publicDoc = await publicRef.get()
                  if (publicDoc.exists && publicDoc.data()?.createdAt?.toMillis() < Date.now() - 1000) {
                    publicUpdated++
                  } else {
                    publicCreated++
                  }
                  
                  if (!result.privateSkipped) {
                    const privateRef = db.collection('globalContactsPrivate').doc(handle)
                    const privateDoc = await privateRef.get()
                    if (privateDoc.exists && privateDoc.data()?.createdAt?.toMillis() < Date.now() - 1000) {
                      privateUpdated++
                    } else {
                      privateCreated++
                    }
                  } else {
                    privateSkipped++
                  }
                }
              }
            } catch (error) {
              console.error(`[backfill] ❌ Error processing user ${userDoc.id}:`, error.message)
              skipped++
            }
          })
        )

        // Small delay between batches to avoid rate limiting
        if (i + batchSize < users.length) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      }

      // Update pagination cursor
      if (users.length < fetchSize) {
        hasMore = false
      } else {
        lastDoc = users[users.length - 1]
      }
    }

    console.log('\n[backfill] Backfill complete')
    console.log(`  📊 Total users scanned: ${totalScanned}`)
    console.log(`  ✅ globalContactsPublic created: ${publicCreated}`)
    console.log(`  ✅ globalContactsPublic updated: ${publicUpdated}`)
    console.log(`  ✅ globalContactsPrivate created: ${privateCreated}`)
    console.log(`  ✅ globalContactsPrivate updated: ${privateUpdated}`)
    console.log(`  ⚠️  Skipped: ${skipped}`)
    console.log(`  📝 Note: ${privateSkipped} users synced to public but skipped private (missing both email and phone)`)
    
    return { 
      totalScanned, 
      publicCreated, 
      publicUpdated, 
      privateCreated, 
      privateUpdated, 
      skipped, 
      privateSkipped 
    }
  } catch (error) {
    console.error('[backfill] Fatal error:', error)
    throw error
  }
}

// Run if called directly
if (require.main === module) {
  backfillUsersToGlobalContacts()
    .then(result => {
      console.log('\n✅ Backfill completed:', result)
      process.exit(0)
    })
    .catch(error => {
      console.error('\n❌ Backfill failed:', error)
      process.exit(1)
    })
}

module.exports = { backfillUsersToGlobalContacts, syncUserToGlobalContacts }


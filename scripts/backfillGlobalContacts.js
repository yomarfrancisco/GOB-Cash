/**
 * Backfill script to populate /globalContactsPublic and /globalContactsPrivate
 * from all contacts in /users/{uid}/contacts/{contactId}
 * 
 * Usage:
 *   node scripts/backfillGlobalContacts.js
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
 * Merge contact data for the same handle
 * Rules:
 * - primaryEmail: take any non-null value (prefer most recently updated)
 * - primaryPhone: same
 * - displayName: prefer most recently updated record
 * - sources: union unique values
 */
function mergeContactData(existing, incoming, incomingUpdatedAt) {
  const merged = {
    handle: existing.handle || incoming.handle,
    displayName: null,
    primaryEmail: null,
    primaryPhone: null,
    sources: new Set(existing.sources || []),
    updatedAt: existing.updatedAt,
    createdAt: existing.createdAt || incoming.createdAt,
  }

  // displayName: prefer most recently updated
  if (incoming.displayName && (!existing.displayName || incomingUpdatedAt >= existing.updatedAt)) {
    merged.displayName = incoming.displayName
  } else if (existing.displayName) {
    merged.displayName = existing.displayName
  }

  // primaryEmail: take any non-null (prefer most recently updated)
  if (incoming.primaryEmail && (!existing.primaryEmail || incomingUpdatedAt >= existing.updatedAt)) {
    merged.primaryEmail = incoming.primaryEmail
  } else if (existing.primaryEmail) {
    merged.primaryEmail = existing.primaryEmail
  }

  // primaryPhone: take any non-null (prefer most recently updated)
  if (incoming.primaryPhone && (!existing.primaryPhone || incomingUpdatedAt >= existing.updatedAt)) {
    merged.primaryPhone = incoming.primaryPhone
  } else if (existing.primaryPhone) {
    merged.primaryPhone = existing.primaryPhone
  }

  // sources: union unique values
  if (incoming.source) {
    merged.sources.add(incoming.source)
  }

  // Update updatedAt to most recent
  if (incomingUpdatedAt > existing.updatedAt) {
    merged.updatedAt = incomingUpdatedAt
  }

  return merged
}

/**
 * Backfill globalContacts from all user contacts
 */
async function backfillGlobalContacts() {
  console.log('[backfill] Starting global contacts backfill...\n')
  
  let totalScanned = 0
  let skipped = 0
  let uniqueHandles = new Map() // handle -> merged contact data
  
  try {
    // Use collection group query to get all contacts across all users
    const contactsRef = db.collectionGroup('contacts')
    
    // Process in batches with pagination
    let lastDoc = null
    let hasMore = true
    const batchSize = 100

    while (hasMore) {
      let query = contactsRef.orderBy(admin.firestore.FieldPath.documentId()).limit(batchSize)
      
      if (lastDoc) {
        query = query.startAfter(lastDoc)
      }

      const snapshot = await query.get()
      const contacts = snapshot.docs
      
      if (contacts.length === 0) {
        hasMore = false
        break
      }

      totalScanned += contacts.length
      console.log(`[backfill] Fetched batch of ${contacts.length} contacts (total scanned: ${totalScanned})`)

      // Process contacts
      for (const contactDoc of contacts) {
        try {
          const contactData = contactDoc.data()
          
          // Skip if no handle
          if (!contactData.handle) {
            skipped++
            continue
          }

          // Normalize handle
          const normalizedHandle = normalizeHandle(contactData.handle)
          if (!normalizedHandle) {
            skipped++
            continue
          }

          // Get updatedAt timestamp (convert to comparable format)
          let updatedAt = Date.now()
          if (contactData.updatedAt) {
            if (contactData.updatedAt.toMillis) {
              updatedAt = contactData.updatedAt.toMillis()
            } else if (contactData.updatedAt._seconds) {
              updatedAt = contactData.updatedAt._seconds * 1000
            } else if (contactData.updatedAt.seconds) {
              updatedAt = contactData.updatedAt.seconds * 1000
            }
          }
          
          let createdAt = Date.now()
          if (contactData.createdAt) {
            if (contactData.createdAt.toMillis) {
              createdAt = contactData.createdAt.toMillis()
            } else if (contactData.createdAt._seconds) {
              createdAt = contactData.createdAt._seconds * 1000
            } else if (contactData.createdAt.seconds) {
              createdAt = contactData.createdAt.seconds * 1000
            }
          }
          
          // Merge with existing data for this handle
          const existing = uniqueHandles.get(normalizedHandle)
          if (existing) {
            const merged = mergeContactData(existing, contactData, updatedAt)
            uniqueHandles.set(normalizedHandle, merged)
          } else {
            // First occurrence of this handle
            uniqueHandles.set(normalizedHandle, {
              handle: normalizedHandle,
              displayName: contactData.displayName || null,
              primaryEmail: contactData.primaryEmail || null,
              primaryPhone: contactData.primaryPhone || null,
              sources: new Set(contactData.source ? [contactData.source] : []),
              updatedAt: updatedAt,
              createdAt: createdAt,
            })
          }
        } catch (error) {
          console.error(`[backfill] ❌ Error processing contact ${contactDoc.id}:`, error.message)
          skipped++
        }
      }

      // Update pagination cursor
      if (contacts.length < batchSize) {
        hasMore = false
      } else {
        lastDoc = contacts[contacts.length - 1]
      }
    }

    console.log(`\n[backfill] Processing complete. Unique handles: ${uniqueHandles.size}\n`)
    console.log('[backfill] Writing to globalContactsPublic and globalContactsPrivate...\n')

    // Write to globalContactsPublic and globalContactsPrivate
    let created = 0
    let updated = 0
    const now = admin.firestore.Timestamp.now()

    for (const [handle, contactData] of uniqueHandles.entries()) {
      try {
        // Convert sources Set to array
        const sourcesArray = Array.from(contactData.sources)

        // 1. Write to globalContactsPublic (public fields only)
        const publicRef = db.collection('globalContactsPublic').doc(handle)
        const publicDoc = await publicRef.get()
        
        const publicData = {
          handle: handle,
          displayName: contactData.displayName,
          sources: sourcesArray,
          updatedAt: now,
        }

        if (publicDoc.exists) {
          await publicRef.update(publicData)
          updated++
        } else {
          publicData.createdAt = now
          await publicRef.set(publicData)
          created++
        }

        // 2. Write to globalContactsPrivate (sensitive fields) - only if we have email or phone
        if (contactData.primaryEmail || contactData.primaryPhone) {
          const privateRef = db.collection('globalContactsPrivate').doc(handle)
          const privateDoc = await privateRef.get()
          
          const privateData = {
            handle: handle,
            updatedAt: now,
          }

          // Only include fields that exist
          if (contactData.primaryEmail) {
            privateData.primaryEmail = contactData.primaryEmail
          }
          if (contactData.primaryPhone) {
            privateData.primaryPhone = contactData.primaryPhone
          }

          if (privateDoc.exists) {
            await privateRef.update(privateData)
          } else {
            privateData.createdAt = now
            await privateRef.set(privateData)
          }
        }

        if ((created + updated) % 50 === 0) {
          console.log(`[backfill] Processed ${created + updated}/${uniqueHandles.size} handles...`)
        }
      } catch (error) {
        console.error(`[backfill] ❌ Error writing handle ${handle}:`, error.message)
      }
    }

    console.log('\n[backfill] Backfill complete')
    console.log(`  📊 Total contacts scanned: ${totalScanned}`)
    console.log(`  📝 Unique handles found: ${uniqueHandles.size}`)
    console.log(`  ✅ Created: ${created}`)
    console.log(`  ✅ Updated: ${updated}`)
    console.log(`  ⚠️  Skipped: ${skipped} (invalid or missing handle)`)
    
    return { 
      totalScanned, 
      uniqueHandles: uniqueHandles.size, 
      created, 
      updated, 
      skipped 
    }
  } catch (error) {
    console.error('[backfill] Fatal error:', error)
    throw error
  }
}

// Run if called directly
if (require.main === module) {
  backfillGlobalContacts()
    .then(result => {
      console.log('\n✅ Backfill completed:', result)
      process.exit(0)
    })
    .catch(error => {
      console.error('\n❌ Backfill failed:', error)
      process.exit(1)
    })
}

module.exports = { backfillGlobalContacts }


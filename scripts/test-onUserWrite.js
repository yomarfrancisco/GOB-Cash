/**
 * Test script to verify onUserWrite trigger creates directory entries
 * 
 * Usage:
 *   node scripts/test-onUserWrite.js <uid>
 * 
 * This script:
 * 1. Updates a single user document (triggers onUserWrite)
 * 2. Waits 5 seconds
 * 3. Checks if /publicDirectory/{handle} and /directoryPrivate/{handle} were created
 * 4. Prints results with document data
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
  try {
    // Try Application Default Credentials first (works with firebase login)
    admin.initializeApp({
      projectId: 'gobankless-dev'
    })
    console.log('[test] Using Application Default Credentials')
  } catch (error) {
    // Fallback to service account if available
    try {
      const serviceAccount = require('../functions/serviceAccountKey.json')
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: 'gobankless-dev'
      })
      console.log('[test] Using service account key')
    } catch (err) {
      console.error('[test] Failed to initialize Firebase Admin')
      console.error('Either run: firebase login')
      console.error('Or set: GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json')
      process.exit(1)
    }
  }
}

const db = admin.firestore()

async function testOnUserWrite(uid) {
  console.log(`\n[test] Testing onUserWrite trigger for user: ${uid}\n`)

  // 1. Read user document
  const userRef = db.collection('users').doc(uid)
  const userDoc = await userRef.get()

  if (!userDoc.exists) {
    console.error(`[test] ❌ User document not found: ${uid}`)
    process.exit(1)
  }

  const userData = userDoc.data()
  const handle = userData.handle

  if (!handle) {
    console.error(`[test] ❌ User has no handle: ${uid}`)
    process.exit(1)
  }

  const normalizedHandle = handle.startsWith('$') 
    ? handle.toLowerCase() 
    : `$${handle.toLowerCase()}`

  console.log(`[test] User details:`)
  console.log(`  - UID: ${uid}`)
  console.log(`  - Handle: ${handle} (normalized: ${normalizedHandle})`)
  console.log(`  - Email: ${userData.email || 'missing'}`)
  console.log(`  - Phone: ${userData.phoneE164 || userData.phoneNumber || 'missing'}`)
  console.log(`  - DisplayName: ${userData.displayName || userData.fullName || 'missing'}`)

  // 2. Check if directory entries already exist
  const publicDirRef = db.collection('publicDirectory').doc(normalizedHandle)
  const privateDirRef = db.collection('directoryPrivate').doc(normalizedHandle)

  const [publicBefore, privateBefore] = await Promise.all([
    publicDirRef.get(),
    privateDirRef.get()
  ])

  console.log(`\n[test] Before update:`)
  console.log(`  - /publicDirectory/${normalizedHandle}: ${publicBefore.exists ? 'EXISTS' : 'MISSING'}`)
  console.log(`  - /directoryPrivate/${normalizedHandle}: ${privateBefore.exists ? 'EXISTS' : 'MISSING'}`)

  // 3. Trigger onUserWrite by updating user document
  console.log(`\n[test] Triggering onUserWrite by updating user document...`)
  
  // Update a harmless field (add a test timestamp)
  const testField = `_testTrigger_${Date.now()}`
  await userRef.update({
    [testField]: admin.firestore.Timestamp.now()
  })

  console.log(`[test] ✅ User document updated (added field: ${testField})`)
  console.log(`[test] Waiting 5 seconds for Cloud Function to execute...\n`)

  // 4. Wait for Cloud Function to execute
  await new Promise(resolve => setTimeout(resolve, 5000))

  // 5. Check if directory entries were created/updated
  const [publicAfter, privateAfter] = await Promise.all([
    publicDirRef.get(),
    privateDirRef.get()
  ])

  console.log(`[test] After update:`)
  console.log(`  - /publicDirectory/${normalizedHandle}: ${publicAfter.exists ? 'EXISTS ✅' : 'MISSING ❌'}`)
  console.log(`  - /directoryPrivate/${normalizedHandle}: ${privateAfter.exists ? 'EXISTS ✅' : 'MISSING ❌'}`)

  // 6. Print document data if they exist
  if (publicAfter.exists) {
    const publicData = publicAfter.data()
    console.log(`\n[test] /publicDirectory/${normalizedHandle} data:`)
    console.log(`  - handle: ${publicData.handle}`)
    console.log(`  - ownerUserId: ${publicData.ownerUserId || 'NULL ❌'}`)
    console.log(`  - displayName: ${publicData.displayName || 'null'}`)
    console.log(`  - phoneCountry: ${publicData.phoneCountry || 'null'}`)
    console.log(`  - isAgent: ${publicData.isAgent || false}`)
    console.log(`  - createdAt: ${publicData.createdAt?.toDate() || 'missing'}`)
    console.log(`  - updatedAt: ${publicData.updatedAt?.toDate() || 'missing'}`)
  }

  if (privateAfter.exists) {
    const privateData = privateAfter.data()
    console.log(`\n[test] /directoryPrivate/${normalizedHandle} data:`)
    console.log(`  - handle: ${privateData.handle}`)
    console.log(`  - ownerUserId: ${privateData.ownerUserId || 'NULL ❌'}`)
    console.log(`  - email: ${privateData.email || 'MISSING ❌'}`)
    console.log(`  - phoneE164: ${privateData.phoneE164 || 'MISSING ❌'}`)
    console.log(`  - phoneCountry: ${privateData.phoneCountry || 'null'}`)
    console.log(`  - createdAt: ${privateData.createdAt?.toDate() || 'missing'}`)
    console.log(`  - updatedAt: ${privateData.updatedAt?.toDate() || 'missing'}`)
  }

  // 7. Summary
  console.log(`\n[test] Summary:`)
  const publicCreated = !publicBefore.exists && publicAfter.exists
  const privateCreated = !privateBefore.exists && privateAfter.exists
  const publicUpdated = publicBefore.exists && publicAfter.exists
  const privateUpdated = privateBefore.exists && privateAfter.exists

  if (publicCreated) {
    console.log(`  ✅ /publicDirectory/${normalizedHandle} was CREATED`)
  } else if (publicUpdated) {
    console.log(`  ✅ /publicDirectory/${normalizedHandle} was UPDATED`)
  } else if (!publicAfter.exists) {
    console.log(`  ❌ /publicDirectory/${normalizedHandle} was NOT created`)
  }

  if (privateCreated) {
    console.log(`  ✅ /directoryPrivate/${normalizedHandle} was CREATED`)
  } else if (privateUpdated) {
    console.log(`  ✅ /directoryPrivate/${normalizedHandle} was UPDATED`)
  } else if (!privateAfter.exists) {
    if (userData.email && (userData.phoneE164 || userData.phoneNumber)) {
      console.log(`  ❌ /directoryPrivate/${normalizedHandle} was NOT created (user has email + phone)`)
    } else {
      console.log(`  ⚠️  /directoryPrivate/${normalizedHandle} was NOT created (user missing email or phone)`)
    }
  }

  // 8. Check Cloud Function logs
  console.log(`\n[test] To view Cloud Function logs, run:`)
  console.log(`  firebase functions:log --project gobankless-dev --only onUserWrite`)

  // Cleanup: remove test field
  const updateData = {}
  updateData[testField] = admin.firestore.FieldValue.delete()
  await userRef.update(updateData)
  console.log(`\n[test] Cleaned up test field: ${testField}`)

  return {
    publicCreated: publicAfter.exists,
    privateCreated: privateAfter.exists,
    publicData: publicAfter.exists ? publicAfter.data() : null,
    privateData: privateAfter.exists ? privateAfter.data() : null
  }
}

const uid = process.argv[2]
if (!uid) {
  console.error('Usage: node scripts/test-onUserWrite.js <uid>')
  console.error('Example: node scripts/test-onUserWrite.js xHKmkizXhPOU25vwTIB6dxhMzSH2')
  process.exit(1)
}

testOnUserWrite(uid)
  .then(() => {
    console.log('\n✅ Test completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error)
    process.exit(1)
  })


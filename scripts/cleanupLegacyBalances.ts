/**
 * One-off cleanup to remove legacy balances field from /users/{uid} docs.
 * Run manually with: pnpm cleanup:balances
 *
 * Requires Firebase Admin credentials (GOOGLE_APPLICATION_CREDENTIALS).
 */

import admin from 'firebase-admin'

async function main() {
  if (admin.apps.length === 0) {
    admin.initializeApp()
  }

  const db = admin.firestore()
  const usersSnap = await db.collection('users').get()

  let cleaned = 0

  for (const docSnap of usersSnap.docs) {
    const data = docSnap.data()
    if (data && Object.prototype.hasOwnProperty.call(data, 'balances')) {
      await docSnap.ref.update({ balances: admin.firestore.FieldValue.delete() })
      cleaned += 1
      console.log(`[cleanup] Removed balances from user ${docSnap.id}`)
    }
  }

  console.log(`[cleanup] Completed. Users cleaned: ${cleaned}/${usersSnap.size}`)
}

main()
  .then(() => {
    console.log('[cleanup] Done')
    process.exit(0)
  })
  .catch((err) => {
    console.error('[cleanup] Failed', err)
    process.exit(1)
  })



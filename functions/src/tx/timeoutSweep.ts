/**
 * Cloud Function: tx_timeoutSweep
 * 
 * Scheduled function that cancels expired transactions.
 * Checks transactions for expiresAt timestamps and marks them CANCELLED if expired.
 * Runs every 10 minutes.
 */

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

const db = admin.firestore()

export const tx_timeoutSweep = functions
  .region('us-central1')
  .pubsub.schedule('every 10 minutes')
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now()

    // Find all transactions with expiresAt <= now and status not terminal
    const q = db.collection('transactions')
      .where('expiresAt', '<=', now)
      .where('status', 'in', ['AWAITING_DEPOSIT', 'DEPOSIT_SENT', 'WITHDRAWAL_REQUESTED', 'WITHDRAWAL_CONFIRMED'])
      .limit(50)

    const snapshot = await q.get()

    if (snapshot.empty) {
      console.log('[tx_timeoutSweep] No expired transactions found')
      return null
    }

    console.log(`[tx_timeoutSweep] Found ${snapshot.size} expired transactions`)

    const batch = db.batch()

    snapshot.docs.forEach((doc) => {
      const tx = doc.data()
      const txRef = doc.ref
      const txId = doc.id

      // Skip if already in terminal state (shouldn't happen, but defensive)
      if (['COMPLETED', 'CANCELLED', 'DISPUTED'].includes(tx.status)) {
        return
      }

      // Update transaction status to CANCELLED
      batch.update(txRef, {
        status: 'CANCELLED',
        statusUpdatedAt: now,
      })

      // Create SYSTEM message
      const msgRef = txRef.collection('messages').doc()
      batch.set(msgRef, {
        id: msgRef.id,
        txId,
        createdAt: now,
        senderType: 'SYSTEM',
        text: `⏱️ Transaction cancelled due to timeout. No action was taken within the required time period.`,
        metadata: {
          status: 'CANCELLED',
          reason: 'timeout',
        },
      })
    })

    await batch.commit()

    console.log(`[tx_timeoutSweep] Cancelled ${snapshot.size} expired transactions`)

    return null
  })


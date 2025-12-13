/**
 * Cloud Function: tx_userConfirmWithdrawal
 * 
 * User confirms withdrawal by typing exact "CONFIRM".
 * Transitions: WITHDRAWAL_REQUESTED -> WITHDRAWAL_CONFIRMED
 */

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { assertTransition } from './state'

const db = admin.firestore()

export const tx_userConfirmWithdrawal = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required')
    }

    const userId = context.auth.uid
    const { txId, confirmText } = data

    if (!txId || typeof txId !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'txId is required')
    }
    if (!confirmText || typeof confirmText !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'confirmText is required')
    }

    // Require exact "CONFIRM" (case-insensitive)
    if (confirmText.trim().toUpperCase() !== 'CONFIRM') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Confirmation text must be exactly "CONFIRM"'
      )
    }

    const txRef = db.collection('transactions').doc(txId)
    const txSnap = await txRef.get()

    if (!txSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Transaction not found')
    }

    const tx = txSnap.data()!
    
    // Verify user is the transaction owner
    if (tx.userId !== userId) {
      throw new functions.https.HttpsError('permission-denied', 'Not authorized for this transaction')
    }

    // Assert valid transition
    assertTransition(tx.status, 'WITHDRAWAL_CONFIRMED')

    const now = admin.firestore.Timestamp.now()
    
    // Set expiration time (2 hours for WITHDRAWAL_CONFIRMED - should be processed quickly)
    const expiresAt = admin.firestore.Timestamp.fromMillis(
      now.toMillis() + 2 * 60 * 60 * 1000 // 2 hours
    )

    // Create SYSTEM message
    const msgRef = txRef.collection('messages').doc()
    const message = {
      id: msgRef.id,
      txId,
      createdAt: now,
      senderType: 'SYSTEM' as const,
      text: '✅ User confirmed withdrawal. Receiver will process USDT transfer shortly.',
      metadata: {
        status: 'WITHDRAWAL_CONFIRMED',
      },
    }

    // Update transaction and create message atomically
    await db.runTransaction(async (t) => {
      t.update(txRef, {
        status: 'WITHDRAWAL_CONFIRMED',
        statusUpdatedAt: now,
        expiresAt, // Timeout for WITHDRAWAL_CONFIRMED state
        'withdrawal.confirmedByUser': true,
        'withdrawal.confirmedAt': now,
      })
      t.set(msgRef, message)
    })

    console.log(`[tx_userConfirmWithdrawal] Transaction ${txId} confirmed by user ${userId}`)

    return { ok: true, status: 'WITHDRAWAL_CONFIRMED' }
  })


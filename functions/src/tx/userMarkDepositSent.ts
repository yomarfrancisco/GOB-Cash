/**
 * Cloud Function: tx_userMarkDepositSent
 * 
 * User marks deposit as sent.
 * Transitions: AWAITING_DEPOSIT -> DEPOSIT_SENT
 */

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { assertTransition } from './state'

const db = admin.firestore()

export const tx_userMarkDepositSent = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required')
    }

    const userId = context.auth.uid
    const { txId, reference } = data

    if (!txId || typeof txId !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'txId is required')
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
    assertTransition(tx.status, 'DEPOSIT_SENT')

    const now = admin.firestore.Timestamp.now()
    
    // Set expiration time (4 hours for DEPOSIT_SENT)
    const expiresAt = admin.firestore.Timestamp.fromMillis(
      now.toMillis() + 4 * 60 * 60 * 1000 // 4 hours
    )

    // Create SYSTEM message
    const msgRef = txRef.collection('messages').doc()
    const message = {
      id: msgRef.id,
      txId,
      createdAt: now,
      senderType: 'SYSTEM' as const,
      text: reference
        ? `Customer marked deposit as sent. Reference: ${reference}.`
        : `Customer marked deposit as sent.`,
      metadata: {
        status: 'DEPOSIT_SENT',
        reference: reference || null,
      },
    }

    // Update transaction and create message atomically
    await db.runTransaction(async (t) => {
      t.update(txRef, {
        status: 'DEPOSIT_SENT',
        statusUpdatedAt: now,
        expiresAt, // Timeout for DEPOSIT_SENT state
      })
      t.set(msgRef, message)
    })

    console.log(`[tx_userMarkDepositSent] Transaction ${txId} marked as sent by user ${userId}`)

    return { ok: true, status: 'DEPOSIT_SENT' }
  })


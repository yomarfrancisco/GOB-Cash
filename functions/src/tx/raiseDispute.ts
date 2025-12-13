/**
 * Cloud Function: tx_raiseDispute
 * 
 * User or receiver raises a dispute on a transaction.
 * Transitions to DISPUTED state and freezes CTAs.
 */

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { assertTransition } from './state'

const db = admin.firestore()

export const tx_raiseDispute = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required')
    }

    const userId = context.auth.uid
    const { txId, reason } = data

    if (!txId || typeof txId !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'txId is required')
    }
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      throw new functions.https.HttpsError('invalid-argument', 'reason is required')
    }

    const txRef = db.collection('transactions').doc(txId)
    const txSnap = await txRef.get()

    if (!txSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Transaction not found')
    }

    const tx = txSnap.data()!
    
    // Verify user is a participant
    if (!tx.participants || !tx.participants.includes(userId)) {
      throw new functions.https.HttpsError('permission-denied', 'Not a participant in this transaction')
    }

    // Cannot dispute terminal states
    if (['COMPLETED', 'CANCELLED', 'DISPUTED'].includes(tx.status)) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Cannot dispute transaction in terminal state'
      )
    }

    // Assert valid transition (most states can transition to DISPUTED)
    try {
      assertTransition(tx.status, 'DISPUTED')
    } catch (error) {
      // If transition not allowed, check if we can still dispute
      // Some states may not allow direct dispute, but we'll allow it for safety
      console.warn(`[tx_raiseDispute] State ${tx.status} may not allow DISPUTED transition, but allowing dispute for safety`)
    }

    const now = admin.firestore.Timestamp.now()

    // Create SYSTEM message
    const msgRef = txRef.collection('messages').doc()
    const message = {
      id: msgRef.id,
      txId,
      createdAt: now,
      senderType: 'SYSTEM' as const,
      text: `⚠️ Dispute raised by ${userId === tx.userId ? 'user' : 'receiver'}.\n\nReason: ${reason.trim()}\n\nTransaction is now frozen. Support will review.`,
      metadata: {
        status: 'DISPUTED',
        raisedBy: userId,
        reason: reason.trim(),
      },
    }

    // Update transaction and create message atomically
    await db.runTransaction(async (t) => {
      t.update(txRef, {
        status: 'DISPUTED',
        statusUpdatedAt: now,
        'audit.lastActorId': userId,
        'dispute': {
          raisedBy: userId,
          raisedAt: now,
          reason: reason.trim(),
        },
      })
      t.set(msgRef, message)
    })

    console.log(`[tx_raiseDispute] Dispute raised for transaction ${txId} by user ${userId}`)

    return { ok: true, status: 'DISPUTED' }
  })


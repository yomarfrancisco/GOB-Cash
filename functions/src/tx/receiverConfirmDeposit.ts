/**
 * Cloud Function: tx_receiverConfirmDeposit
 * 
 * Receiver confirms deposit was received.
 * Transitions: DEPOSIT_SENT -> DEPOSIT_RECEIVED
 * Creates proof object
 */

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { assertTransition } from './state'

const db = admin.firestore()

export const tx_receiverConfirmDeposit = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required')
    }

    const receiverId = context.auth.uid
    const { txId } = data

    if (!txId || typeof txId !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'txId is required')
    }

    const txRef = db.collection('transactions').doc(txId)
    const txSnap = await txRef.get()

    if (!txSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Transaction not found')
    }

    const tx = txSnap.data()!
    
    // Verify user is the receiver
    if (tx.receiverId !== receiverId) {
      throw new functions.https.HttpsError('permission-denied', 'Not receiver for this transaction')
    }

    // Assert valid transition
    assertTransition(tx.status, 'DEPOSIT_RECEIVED')

    const now = admin.firestore.Timestamp.now()

    // Create proof object
    const proofRef = txRef.collection('proofs').doc()
    const proof = {
      id: proofRef.id,
      txId,
      kind: 'PROOF_OF_DEPOSIT' as const,
      method: 'manual' as const,
      confirmedBy: receiverId,
      confirmedAt: now,
      evidence: tx.userEvidence?.reference
        ? { type: 'reference' as const, value: tx.userEvidence.reference }
        : null,
      signature: `server-hash-${txId}-${now.toMillis()}`,
    }

    // Create SYSTEM message
    const msgRef = txRef.collection('messages').doc()
    const message = {
      id: msgRef.id,
      txId,
      createdAt: now,
      senderType: 'SYSTEM' as const,
      text: '✅ Deposit confirmed by receiver. Funds will be credited and locked for 24 hours.',
      metadata: {
        status: 'DEPOSIT_RECEIVED',
      },
    }

    // Update transaction, create proof, and create message atomically
    await db.runTransaction(async (t) => {
      t.update(txRef, {
        status: 'DEPOSIT_RECEIVED',
        statusUpdatedAt: now,
        'audit.lastActorId': receiverId,
      })
      t.set(proofRef, proof)
      t.set(msgRef, message)
    })

    console.log(`[tx_receiverConfirmDeposit] Transaction ${txId} confirmed by receiver ${receiverId}`)

    return { ok: true, status: 'DEPOSIT_RECEIVED' }
  })


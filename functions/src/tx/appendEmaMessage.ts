/**
 * Cloud Function: tx_appendEmaMessage
 * 
 * Appends an Ema (AI assistant) message to a transaction thread.
 * Used for acknowledgements and confirmations.
 * Writes message to transactions/{txId}/messages using Admin SDK.
 * Callable: must be invoked via httpsCallable; CORS handled by Firebase.
 */

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

const db = admin.firestore()

export const tx_appendEmaMessage = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    // Require authentication (only authenticated clients may trigger Ema messages)
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required')
    }

    const userId = context.auth.uid
    const { txId, text } = data || {}

    if (!txId || typeof txId !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'txId is required')
    }
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      throw new functions.https.HttpsError('invalid-argument', 'text is required')
    }

    const txRef = db.collection('transactions').doc(txId)
    const txSnap = await txRef.get()

    if (!txSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Transaction not found')
    }

    const tx = txSnap.data()!

    // Verify caller is a participant; prevents arbitrary writes
    if (!tx.participants || !tx.participants.includes(userId)) {
      throw new functions.https.HttpsError('permission-denied', 'Not a participant in this transaction')
    }

    const now = admin.firestore.Timestamp.now()
    const msgRef = txRef.collection('messages').doc()

    const message = {
      id: msgRef.id,
      txId,
      createdAt: now,
      senderType: 'SAMBA' as const, // Use SAMBA type so it renders as AI (not filtered out)
      senderUid: 'samba', // Backend identifier (can remain 'samba' for compatibility)
      text: text.trim(),
    }

    await msgRef.set(message)

    console.log(`[tx_appendEmaMessage] Ema message appended to tx ${txId} by ${userId}`)

    return { ok: true, messageId: msgRef.id }
  })


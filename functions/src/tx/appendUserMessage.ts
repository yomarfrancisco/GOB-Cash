/**
 * Cloud Function: tx_appendUserMessage
 * 
 * Appends a user message to a transaction thread.
 * Writes message to transactions/{txId}/messages
 */

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

const db = admin.firestore()

export const tx_appendUserMessage = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required')
    }

    const userId = context.auth.uid
    const { txId, text } = data

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
    
    // Verify user is a participant
    if (!tx.participants || !tx.participants.includes(userId)) {
      throw new functions.https.HttpsError('permission-denied', 'Not a participant in this transaction')
    }

    const now = admin.firestore.Timestamp.now()

    // Create user message
    const msgRef = txRef.collection('messages').doc()
    const message = {
      id: msgRef.id,
      txId,
      createdAt: now,
      senderType: 'USER' as const,
      senderId: userId,
      text: text.trim(),
    }

    await msgRef.set(message)

    console.log(`[tx_appendUserMessage] User ${userId} sent message to transaction ${txId}`)

    return { ok: true, messageId: msgRef.id }
  })


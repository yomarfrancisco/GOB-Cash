/**
 * Cloud Function: tx_appendUserMessage
 * 
 * Appends a user message to a transaction thread.
 * Writes message to transactions/{txId}/messages
 * 
 * Migrated to Functions v2 with explicit CORS support to fix browser CORS errors.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'

const db = admin.firestore()

export const tx_appendUserMessage = onCall(
  { region: 'us-central1', cors: true },
  async (request) => {
    const { auth, data } = request

    if (!auth) {
      throw new HttpsError('unauthenticated', 'Login required')
    }

    const userId = auth.uid
    const { txId, text } = data

    if (!txId || typeof txId !== 'string') {
      throw new HttpsError('invalid-argument', 'txId is required')
    }
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      throw new HttpsError('invalid-argument', 'text is required')
    }

    const txRef = db.collection('transactions').doc(txId)
    const txSnap = await txRef.get()

    if (!txSnap.exists) {
      throw new HttpsError('not-found', 'Transaction not found')
    }

    const tx = txSnap.data()!

    // Verify user is a participant
    if (!tx.participants || !tx.participants.includes(userId)) {
      throw new HttpsError('permission-denied', 'Not a participant in this transaction')
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
  }
)


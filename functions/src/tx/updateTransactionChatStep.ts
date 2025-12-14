/**
 * Cloud Function: tx_updateTransactionChatStep
 * 
 * Updates transaction chatStep and optionally sends Samba message.
 * Used when agent confirms deposit (transitions to DEPOSIT_CONFIRMED_LOCKED_DONE).
 */

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

const db = admin.firestore()

export const tx_updateTransactionChatStep = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required')
    }

    const { txId, chatStep, sambaMessage } = data

    if (!txId || typeof txId !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'txId is required')
    }
    if (!chatStep || typeof chatStep !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'chatStep is required')
    }

    const txRef = db.collection('transactions').doc(txId)
    const txSnap = await txRef.get()

    if (!txSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Transaction not found')
    }

    const now = admin.firestore.Timestamp.now()

    // Update transaction chatStep
    await txRef.update({
      chatStep,
      updatedAt: now,
    })

    // If Samba message provided, create it
    if (sambaMessage && typeof sambaMessage === 'string') {
      const msgRef = txRef.collection('messages').doc()
      await msgRef.set({
        id: msgRef.id,
        txId,
        senderType: 'SAMBA',
        senderUid: 'samba',
        text: sambaMessage,
        createdAt: now,
      })
    }

    return { ok: true, chatStep }
  })


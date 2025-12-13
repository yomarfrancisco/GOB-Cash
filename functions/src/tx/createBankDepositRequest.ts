/**
 * Cloud Function: tx_createBankDepositRequest
 * 
 * Creates a new bank deposit transaction request.
 * Initializes transaction with AWAITING_DEPOSIT status.
 */

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import type { TxStatus } from './state'

const db = admin.firestore()

export const tx_createBankDepositRequest = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required')
    }

    const userId = context.auth.uid
    const { receiverId, amountZar } = data

    // Validate inputs
    if (!receiverId || typeof receiverId !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'receiverId is required')
    }
    if (!amountZar || typeof amountZar !== 'number' || amountZar <= 0) {
      throw new functions.https.HttpsError('invalid-argument', 'amountZar must be a positive number')
    }

    const now = admin.firestore.Timestamp.now()
    const participants = [userId, receiverId]

    // Create transaction document
    const txRef = db.collection('transactions').doc()
    const txId = txRef.id

    const transaction = {
      id: txId,
      type: 'BANK_DEPOSIT_TO_USDT_TRON' as const,
      userId,
      receiverId,
      participants,
      status: 'AWAITING_DEPOSIT' as TxStatus,
      createdAt: now,
      statusUpdatedAt: now,
      amountZar,
      unlockAt: null,
      withdrawal: {},
    }

    // Create initial SYSTEM message
    const msgRef = txRef.collection('messages').doc()
    const message = {
      id: msgRef.id,
      txId,
      createdAt: now,
      senderType: 'SYSTEM' as const,
      text: `Bank deposit request created for R${amountZar.toFixed(2)}. Please deposit the funds and mark as sent.`,
      metadata: {
        status: 'AWAITING_DEPOSIT',
      },
    }

    // Write transaction and message atomically
    await db.runTransaction(async (t) => {
      t.set(txRef, transaction)
      t.set(msgRef, message)
    })

    console.log(`[tx_createBankDepositRequest] Created transaction ${txId} for user ${userId}`)

    return { txId, status: 'AWAITING_DEPOSIT' }
  })


/**
 * Cloud Function: tx_createBankDepositRequest
 * 
 * Creates a new bank deposit transaction request.
 * Initializes transaction with AWAITING_DEPOSIT status.
 * 
 * IMPORTANT: This is a CALLABLE function (.https.onCall)
 * - CORS is automatically handled by Firebase infrastructure
 * - Must be called via httpsCallable() from client SDK
 * - Does NOT support direct HTTP fetch() calls
 */

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import type { TxStatus } from './state'

const db = admin.firestore()

// CRITICAL: Must use .https.onCall (not .https.onRequest)
// This ensures proper CORS handling and callable endpoint resolution
export const tx_createBankDepositRequest = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    // Log function invocation for debugging
    console.log('[tx_createBankDepositRequest] Function invoked', {
      hasAuth: !!context.auth,
      userId: context.auth?.uid,
      timestamp: new Date().toISOString(),
    })

    if (!context.auth) {
      console.error('[tx_createBankDepositRequest] Unauthenticated request')
      throw new functions.https.HttpsError('unauthenticated', 'Login required')
    }

    const userId = context.auth.uid
    const { receiverId, amountZar } = data

    // Validate inputs with detailed logging
    if (!receiverId || typeof receiverId !== 'string') {
      console.error('[tx_createBankDepositRequest] Invalid receiverId', { receiverId, type: typeof receiverId })
      throw new functions.https.HttpsError('invalid-argument', 'receiverId is required')
    }
    if (!amountZar || typeof amountZar !== 'number' || amountZar <= 0) {
      console.error('[tx_createBankDepositRequest] Invalid amountZar', { amountZar, type: typeof amountZar })
      throw new functions.https.HttpsError('invalid-argument', 'amountZar must be a positive number')
    }

    const now = admin.firestore.Timestamp.now()
    const participants = [userId, receiverId]
    
    // Set expiration time (4 hours for AWAITING_DEPOSIT)
    const expiresAt = admin.firestore.Timestamp.fromMillis(
      now.toMillis() + 4 * 60 * 60 * 1000 // 4 hours
    )

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
      expiresAt, // Timeout for AWAITING_DEPOSIT state
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
    try {
      await db.runTransaction(async (t) => {
        t.set(txRef, transaction)
        t.set(msgRef, message)
      })

      console.log(`[tx_createBankDepositRequest] Successfully created transaction ${txId} for user ${userId}`, {
        txId,
        userId,
        receiverId,
        amountZar,
        status: 'AWAITING_DEPOSIT',
      })

      // Return response - onCall functions automatically handle CORS
      return { txId, status: 'AWAITING_DEPOSIT' }
    } catch (error: any) {
      console.error(`[tx_createBankDepositRequest] Failed to create transaction for user ${userId}`, {
        error: error.message,
        errorCode: error.code,
        userId,
        receiverId,
        amountZar,
      })
      throw new functions.https.HttpsError('internal', 'Failed to create transaction', error)
    }
  })


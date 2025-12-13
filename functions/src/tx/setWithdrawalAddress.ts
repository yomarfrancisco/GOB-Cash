/**
 * Cloud Function: tx_setWithdrawalAddress
 * 
 * User sets withdrawal address for TRON network.
 * Transitions: READY_FOR_WITHDRAWAL -> WITHDRAWAL_REQUESTED
 */

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { assertTransition } from './state'

const db = admin.firestore()

/**
 * Validate TRON address format
 * TRON addresses: start with T, base58check, ~34 characters
 */
function validateTronAddress(address: string): boolean {
  if (!address || typeof address !== 'string') return false
  const trimmed = address.trim()
  
  // Basic validation: starts with T, length ~34
  if (!trimmed.startsWith('T') || trimmed.length < 33 || trimmed.length > 35) {
    return false
  }
  
  // Base58check characters (0-9, A-H, J-N, P-Z, a-k, m-z)
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/
  if (!base58Regex.test(trimmed)) {
    return false
  }
  
  return true
}

export const tx_setWithdrawalAddress = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required')
    }

    const userId = context.auth.uid
    const { txId, tronAddress } = data

    if (!txId || typeof txId !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'txId is required')
    }
    if (!tronAddress || typeof tronAddress !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'tronAddress is required')
    }

    // Validate TRON address
    if (!validateTronAddress(tronAddress)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid TRON address. Must start with T and be ~34 characters.'
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
    assertTransition(tx.status, 'WITHDRAWAL_REQUESTED')

    const now = admin.firestore.Timestamp.now()
    const amountZar = tx.amountZar || 0
    
    // For v1: 1:1 ZAR to USDT conversion (can be made configurable later)
    const amountUsdt = amountZar
    
    // Set expiration time (24 hours for WITHDRAWAL_REQUESTED)
    const expiresAt = admin.firestore.Timestamp.fromMillis(
      now.toMillis() + 24 * 60 * 60 * 1000 // 24 hours
    )

    // Create SYSTEM message
    const msgRef = txRef.collection('messages').doc()
    const message = {
      id: msgRef.id,
      txId,
      createdAt: now,
      senderType: 'SYSTEM' as const,
      text: `Withdrawal address set: ${tronAddress}\n\nAmount: ${amountUsdt.toFixed(2)} USDT (TRON)\n\nType CONFIRM to proceed with withdrawal.`,
      metadata: {
        status: 'WITHDRAWAL_REQUESTED',
        tronAddress,
        amountUsdt,
      },
    }

    // Update transaction and create message atomically
    await db.runTransaction(async (t) => {
      t.update(txRef, {
        status: 'WITHDRAWAL_REQUESTED',
        statusUpdatedAt: now,
        expiresAt, // Timeout for WITHDRAWAL_REQUESTED state
        withdrawal: {
          network: 'TRON',
          tronAddress: tronAddress.trim(),
          amountUsdt,
        },
      })
      t.set(msgRef, message)
    })

    console.log(`[tx_setWithdrawalAddress] Transaction ${txId} withdrawal address set by user ${userId}`)

    return { ok: true, status: 'WITHDRAWAL_REQUESTED', tronAddress: tronAddress.trim(), amountUsdt }
  })


/**
 * Cloud Function: tx_setWithdrawalAddressCandidate
 * 
 * User sets withdrawal address candidate (TRON address) during deposit chat flow.
 * Updates withdrawalAddressCandidate and chatStep server-side.
 * Used in WAITING_FOR_SENT_PROOF -> WAITING_FOR_WALLET_ADDRESS
 * and WAITING_FOR_WALLET_ADDRESS -> WAITING_FOR_AGENT_CONFIRMATION transitions.
 */

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

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

export const tx_setWithdrawalAddressCandidate = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required')
    }

    const userId = context.auth.uid
    const { txId, tronAddress, chatStep } = data

    if (!txId || typeof txId !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'txId is required')
    }
    if (!tronAddress || typeof tronAddress !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'tronAddress is required')
    }
    if (!chatStep || typeof chatStep !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'chatStep is required')
    }

    // Validate TRON address
    if (!validateTronAddress(tronAddress)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid TRON address. Must start with T and be ~34 characters.'
      )
    }

    // Validate chatStep is one of the expected values
    const validChatSteps = ['WAITING_FOR_WALLET_ADDRESS', 'WAITING_FOR_AGENT_CONFIRMATION']
    if (!validChatSteps.includes(chatStep)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        `chatStep must be one of: ${validChatSteps.join(', ')}`
      )
    }

    const txRef = db.collection('transactions').doc(txId)
    const txSnap = await txRef.get()

    if (!txSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Transaction not found')
    }

    const tx = txSnap.data()!
    
    // Verify user is a participant (customer or agent)
    if (!tx.participants || !Array.isArray(tx.participants) || !tx.participants.includes(userId)) {
      throw new functions.https.HttpsError('permission-denied', 'Not authorized for this transaction')
    }

    const now = admin.firestore.Timestamp.now()
    const trimmedAddress = tronAddress.trim()

    // Update transaction with withdrawal address candidate and chatStep
    await txRef.update({
      withdrawalAddressCandidate: trimmedAddress,
      chatStep,
      updatedAt: now,
    })

    console.log(`[tx_setWithdrawalAddressCandidate] Transaction ${txId} withdrawal address candidate set by user ${userId}, chatStep updated to ${chatStep}`)

    return { ok: true, chatStep, withdrawalAddressCandidate: trimmedAddress }
  })


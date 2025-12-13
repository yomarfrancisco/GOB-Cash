/**
 * Cloud Function: tx_sendUsdtTron
 * 
 * Receiver sends USDT (TRC-20) from treasury wallet to user's TRON address.
 * Transitions: WITHDRAWAL_CONFIRMED -> WITHDRAWAL_SENDING -> WITHDRAWAL_SENT -> COMPLETED
 * 
 * Includes idempotency checks to prevent double-spending.
 */

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { assertTransition } from './state'
import TronWeb from 'tronweb'

const db = admin.firestore()

/**
 * Initialize TronWeb instance
 */
function getTronWeb(): TronWeb {
  const privateKey = functions.config().tron?.treasury_private_key
  const fullHost = functions.config().tron?.fullhost || 'https://api.trongrid.io'
  const apiKey = functions.config().tron?.api_key

  if (!privateKey) {
    throw new Error('TRON_TREASURY_PRIVATE_KEY not configured')
  }

  const tronWeb = new TronWeb({
    fullHost,
    headers: apiKey ? { 'TRON-PRO-API-KEY': apiKey } : undefined,
    privateKey,
  })

  return tronWeb
}

/**
 * USDT TRC-20 contract address (mainnet)
 * Tether USD (USDT) on TRON: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
 */
const USDT_CONTRACT_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'

export const tx_sendUsdtTron = functions
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

    // Assert valid transition (can go directly to WITHDRAWAL_SENT)
    assertTransition(tx.status, 'WITHDRAWAL_SENT')

    // Idempotency check: if txHash already exists, return it
    if (tx.withdrawal?.txHash) {
      console.log(`[tx_sendUsdtTron] Transaction ${txId} already has txHash: ${tx.withdrawal.txHash}`)
      return {
        ok: true,
        status: tx.status,
        txHash: tx.withdrawal.txHash,
        alreadySent: true,
      }
    }

    const withdrawal = tx.withdrawal || {}
    const tronAddress = withdrawal.tronAddress
    const amountUsdt = withdrawal.amountUsdt || tx.amountZar || 0

    if (!tronAddress) {
      throw new functions.https.HttpsError('invalid-argument', 'Withdrawal address not set')
    }

    if (amountUsdt <= 0) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid withdrawal amount')
    }

    const now = admin.firestore.Timestamp.now()

    try {
      // Initialize TronWeb
      const tronWeb = getTronWeb()
      
      // Convert USDT amount to Sun (TRON's smallest unit, 1 USDT = 1,000,000 Sun for TRC-20)
      const amountSun = Math.floor(amountUsdt * 1000000)

      // Status will be updated to WITHDRAWAL_SENT after successful send

      // Send USDT TRC-20 transfer
      console.log(`[tx_sendUsdtTron] Sending ${amountUsdt} USDT to ${tronAddress} for transaction ${txId}`)
      
      // Get contract instance
      const contract = await tronWeb.contract().at(USDT_CONTRACT_ADDRESS)
      
      // Call transfer function
      const result: any = await contract.transfer(tronAddress, amountSun).send()
      
      // Extract transaction hash from result (TronWeb returns different formats)
      let txHash: string
      if (typeof result === 'string') {
        txHash = result
      } else if (result?.txid) {
        txHash = result.txid
      } else if (result?.transaction?.txID) {
        txHash = result.transaction.txID
      } else {
        throw new Error('Could not extract transaction hash from result')
      }

      // Verify transaction was broadcast
      if (!txHash) {
        throw new Error('Transaction hash not returned')
      }

      console.log(`[tx_sendUsdtTron] USDT sent successfully. TxHash: ${txHash}`)

      // Create withdrawal document for audit trail
      const withdrawalRef = db.collection('withdrawals').doc()
      const withdrawalDoc = {
        id: withdrawalRef.id,
        txId,
        userId: tx.userId,
        receiverId,
        network: 'TRON',
        tronAddress,
        amountUsdt,
        txHash,
        status: 'SENT',
        createdAt: now,
        sentAt: now,
      }

      // Create SYSTEM message
      const msgRef = txRef.collection('messages').doc()
      const message = {
        id: msgRef.id,
        txId,
        createdAt: now,
        senderType: 'SYSTEM' as const,
        text: `✅ USDT sent successfully!\n\nTxHash: ${txHash}\n\nAmount: ${amountUsdt.toFixed(2)} USDT (TRON)\n\nTransaction will be confirmed on the TRON network shortly.`,
        metadata: {
          status: 'WITHDRAWAL_SENT',
          txHash,
        },
      }

      // Update transaction, create withdrawal doc, and create message atomically
      await db.runTransaction(async (t) => {
        t.update(txRef, {
          status: 'WITHDRAWAL_SENT',
          statusUpdatedAt: now,
          'withdrawal.txHash': txHash,
          'withdrawal.withdrawalId': withdrawalRef.id,
          'withdrawal.sentAt': now,
        })
        t.set(withdrawalRef, withdrawalDoc)
        t.set(msgRef, message)
      })

      // Transition to COMPLETED after a short delay (or can be done by a separate listener)
      // For now, mark as COMPLETED immediately
      setTimeout(async () => {
        try {
          await txRef.update({
            status: 'COMPLETED',
            statusUpdatedAt: admin.firestore.Timestamp.now(),
          })
          
          const completedMsgRef = txRef.collection('messages').doc()
          await completedMsgRef.set({
            id: completedMsgRef.id,
            txId,
            createdAt: admin.firestore.Timestamp.now(),
            senderType: 'SYSTEM',
            text: '✅ Transaction completed successfully.',
            metadata: {
              status: 'COMPLETED',
            },
          })
        } catch (error) {
          console.error(`[tx_sendUsdtTron] Failed to mark transaction ${txId} as completed:`, error)
        }
      }, 2000)

      return {
        ok: true,
        status: 'WITHDRAWAL_SENT',
        txHash,
        withdrawalId: withdrawalRef.id,
      }
    } catch (error: any) {
      console.error(`[tx_sendUsdtTron] Error sending USDT for transaction ${txId}:`, error)
      
      // Revert status on error
      await txRef.update({
        status: 'WITHDRAWAL_CONFIRMED', // Revert to previous state
        statusUpdatedAt: admin.firestore.Timestamp.now(),
      })

      // Create error message
      const errorMsgRef = txRef.collection('messages').doc()
      await errorMsgRef.set({
        id: errorMsgRef.id,
        txId,
        createdAt: admin.firestore.Timestamp.now(),
        senderType: 'SYSTEM',
        text: `❌ Failed to send USDT. Please try again or contact support.\n\nError: ${error.message || 'Unknown error'}`,
        metadata: {
          status: 'WITHDRAWAL_CONFIRMED',
          error: true,
        },
      })

      throw new functions.https.HttpsError(
        'internal',
        'Failed to send USDT',
        error.message
      )
    }
  })


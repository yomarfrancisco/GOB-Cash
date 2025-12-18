/**
 * Cloud Function: tx_withdrawTronUSDT
 * 
 * Custodial USDT withdrawal on TRON network with partial fill on treasury shortfall.
 * 
 * Features:
 * - Instant withdrawal if treasury has sufficient balance
 * - Partial fill if treasury balance is insufficient
 * - Zero fill if treasury balance is zero
 * - Email notification to CoreAgent on shortfall
 * - Firestore ledger/accounting
 */

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { getTronWeb, getTreasuryUsdtBalance, USDT_CONTRACT_ADDRESS, USDT_DECIMALS, validateTronAddress } from '../utils/tronUtils'
import { sendEmailViaResend, getCoreAgentEmail, generateTreasuryShortfallEmail } from '../utils/resendEmail'

const db = admin.firestore()

/**
 * Withdrawal status types
 */
type WithdrawalStatus = 
  | 'PENDING'
  | 'BROADCAST_PARTIAL'
  | 'BROADCAST_FULL'
  | 'FAILED_ZERO_TREASURY'
  | 'CONFIRMED'

/**
 * Fixed withdrawal fee (USDT)
 * TODO: Make this configurable
 */
const WITHDRAWAL_FEE_USDT = 0

/**
 * Get user USDT balance from cashZAR wallet
 */
async function getUserUsdtBalance(userId: string): Promise<number> {
  const walletRef = db.collection('users').doc(userId).collection('wallets').doc('cashZAR')
  const walletSnap = await walletRef.get()
  
  if (!walletSnap.exists) {
    return 0
  }
  
  const walletData = walletSnap.data()
  return walletData?.usdtBalance || 0
}

/**
 * Get user info for email notifications
 */
async function getUserInfo(userId: string): Promise<{ handle: string | null; email: string | null }> {
  const userRef = db.collection('users').doc(userId)
  const userSnap = await userRef.get()
  
  if (!userSnap.exists) {
    return { handle: null, email: null }
  }
  
  const userData = userSnap.data()
  return {
    handle: userData?.handle || userData?.userHandle || null,
    email: userData?.email || null,
  }
}

export const tx_withdrawTronUSDT = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    // Require authentication
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required')
    }

    const userId = context.auth.uid
    const { toAddress, amountUSDT } = data

    // Validate input
    if (!toAddress || typeof toAddress !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'toAddress is required')
    }

    if (!amountUSDT || typeof amountUSDT !== 'number' || amountUSDT <= 0) {
      throw new functions.https.HttpsError('invalid-argument', 'amountUSDT must be a positive number')
    }

    // Validate TRON address format
    if (!validateTronAddress(toAddress)) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid TRON address format')
    }

    const now = admin.firestore.Timestamp.now()
    const withdrawalRef = db.collection('withdrawals').doc()

    try {
      // 1. Read user USDT available balance
      const userAvailableUSDT = await getUserUsdtBalance(userId)
      
      // 2. Determine max sendable by user
      const maxSendableByUser = Math.min(userAvailableUSDT, amountUSDT)
      
      if (maxSendableByUser <= 0) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Insufficient user balance',
          { userAvailableUSDT, requestedAmountUSDT: amountUSDT }
        )
      }

      // 3. Query treasury on-chain balance
      const treasuryUsdt = await getTreasuryUsdtBalance()

      // 4. Determine send amount (accounting for fee)
      // Fee is charged to user, so we need treasury to cover (sendAmount + fee)
      // But for now, fee is 0, so just check sendAmount
      const sendAmountUSDT = Math.min(maxSendableByUser, treasuryUsdt - WITHDRAWAL_FEE_USDT)
      const shortfallUSDT = amountUSDT - sendAmountUSDT

      // 5. Handle zero treasury case
      if (treasuryUsdt <= WITHDRAWAL_FEE_USDT || sendAmountUSDT <= 0) {
        // Create withdrawal record: FAILED_ZERO_TREASURY
        const withdrawalDoc = {
          id: withdrawalRef.id,
          userId,
          toAddress: toAddress.trim(),
          requestedAmountUSDT: amountUSDT,
          sentAmountUSDT: 0,
          feeUSDT: WITHDRAWAL_FEE_USDT,
          status: 'FAILED_ZERO_TREASURY' as WithdrawalStatus,
          txId: null,
          treasuryBalanceAtAttemptUSDT: treasuryUsdt,
          shortfallUSDT: amountUSDT,
          createdAt: now,
          updatedAt: now,
        }

        await withdrawalRef.set(withdrawalDoc)

        // Send email to CoreAgent
        const userInfo = await getUserInfo(userId)
        const emailHtml = generateTreasuryShortfallEmail(
          withdrawalRef.id,
          userId,
          userInfo.handle,
          userInfo.email,
          toAddress.trim(),
          amountUSDT,
          0, // sentAmountUSDT
          treasuryUsdt,
          amountUSDT, // shortfallUSDT
          null, // txId
          now
        )

        try {
          await sendEmailViaResend(
            getCoreAgentEmail(),
            `Treasury Shortfall: Withdrawal Failed - Zero Treasury`,
            emailHtml
          )
        } catch (emailError: any) {
          console.error('[tx_withdrawTronUSDT] Failed to send email:', emailError)
          // Don't fail the function if email fails
        }

        return {
          withdrawalId: withdrawalRef.id,
          requestedAmountUSDT: amountUSDT,
          sentAmountUSDT: 0,
          feeUSDT: WITHDRAWAL_FEE_USDT,
          treasuryBalanceAtAttemptUSDT: treasuryUsdt,
          shortfallUSDT: amountUSDT,
          txId: null,
          status: 'FAILED_ZERO_TREASURY',
        }
      }

      // 6. Atomic Firestore transaction: debit user and create withdrawal record
      const walletRef = db.collection('users').doc(userId).collection('wallets').doc('cashZAR')
      const status: WithdrawalStatus = sendAmountUSDT < amountUSDT ? 'BROADCAST_PARTIAL' : 'BROADCAST_FULL'
      
      let txId: string | null = null

      await db.runTransaction(async (t) => {
        // Read current wallet balance
        const walletSnap = await t.get(walletRef)
        const currentBalance = walletSnap.data()?.usdtBalance || 0

        // Verify balance hasn't changed (double-spend protection)
        if (currentBalance < sendAmountUSDT + WITHDRAWAL_FEE_USDT) {
          throw new functions.https.HttpsError(
            'failed-precondition',
            'Insufficient balance (changed during transaction)'
          )
        }

        // Debit user balance
        const newBalance = currentBalance - (sendAmountUSDT + WITHDRAWAL_FEE_USDT)
        t.update(walletRef, {
          usdtBalance: newBalance,
          updatedAt: now,
        })

        // Create withdrawal record
        const withdrawalDoc = {
          id: withdrawalRef.id,
          userId,
          toAddress: toAddress.trim(),
          requestedAmountUSDT: amountUSDT,
          sendAmountUSDT: sendAmountUSDT,
          feeUSDT: WITHDRAWAL_FEE_USDT,
          status,
          txId: null, // Will be updated after broadcast
          treasuryBalanceAtAttemptUSDT: treasuryUsdt,
          shortfallUSDT,
          createdAt: now,
          updatedAt: now,
        }
        t.set(withdrawalRef, withdrawalDoc)
      })

      // 7. Broadcast on-chain transfer from treasury
      try {
        const tronWeb = getTronWeb()
        const contract = await tronWeb.contract().at(USDT_CONTRACT_ADDRESS)
        
        // Convert USDT to smallest unit (Sun for TRC-20)
        const amountSun = Math.floor(sendAmountUSDT * Math.pow(10, USDT_DECIMALS))
        
        console.log(`[tx_withdrawTronUSDT] Broadcasting ${sendAmountUSDT} USDT to ${toAddress.trim()}`)
        
        const result: any = await contract.transfer(toAddress.trim(), amountSun).send()
        
        // Extract transaction hash
        if (typeof result === 'string') {
          txId = result
        } else if (result?.txid) {
          txId = result.txid
        } else if (result?.transaction?.txID) {
          txId = result.transaction.txID
        } else {
          throw new Error('Could not extract transaction hash from result')
        }

        // Update withdrawal record with txId
        await withdrawalRef.update({
          txId,
          updatedAt: admin.firestore.Timestamp.now(),
        })

        console.log(`[tx_withdrawTronUSDT] USDT sent successfully. TxHash: ${txId}`)
      } catch (broadcastError: any) {
        console.error('[tx_withdrawTronUSDT] Error broadcasting transaction:', broadcastError)
        
        // Update withdrawal status to indicate broadcast failure
        await withdrawalRef.update({
          status: 'PENDING', // Could add FAILED_BROADCAST status
          updatedAt: admin.firestore.Timestamp.now(),
        })
        
        // Note: User balance was already debited, so we should handle this case
        // For now, we'll throw an error and let the caller handle it
        throw new functions.https.HttpsError(
          'internal',
          'Failed to broadcast transaction',
          broadcastError.message
        )
      }

      // 8. If partial fill, send email to CoreAgent
      if (sendAmountUSDT < amountUSDT) {
        const userInfo = await getUserInfo(userId)
        const emailHtml = generateTreasuryShortfallEmail(
          withdrawalRef.id,
          userId,
          userInfo.handle,
          userInfo.email,
          toAddress.trim(),
          amountUSDT, // requestedAmountUSDT
          sendAmountUSDT, // sentAmountUSDT
          treasuryUsdt, // treasuryBalanceUSDT
          shortfallUSDT,
          txId,
          now
        )

        try {
          await sendEmailViaResend(
            getCoreAgentEmail(),
            `Treasury Shortfall: Withdrawal Partially Filled`,
            emailHtml
          )
        } catch (emailError: any) {
          console.error('[tx_withdrawTronUSDT] Failed to send email:', emailError)
          // Don't fail the function if email fails
        }
      }

      return {
        withdrawalId: withdrawalRef.id,
        requestedAmountUSDT: amountUSDT,
        sendAmountUSDT: sendAmountUSDT,
        feeUSDT: WITHDRAWAL_FEE_USDT,
        treasuryBalanceAtAttemptUSDT: treasuryUsdt,
        shortfallUSDT,
        txId,
        status,
      }
    } catch (error: any) {
      console.error('[tx_withdrawTronUSDT] Error:', error)
      
      // If it's already an HttpsError, re-throw it
      if (error instanceof functions.https.HttpsError) {
        throw error
      }
      
      // Otherwise, wrap it
      throw new functions.https.HttpsError(
        'internal',
        'Withdrawal failed',
        error.message
      )
    }
  })


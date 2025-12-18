/**
 * Cloud Function: tx_withdrawTronUSDT
 * 
 * Custodial USDT withdrawal on TRON network with hard fail policy.
 * 
 * Features:
 * - Hard fail only: rejects if treasury cannot cover full amount
 * - Safe accounting: debit first, then broadcast, refund on broadcast failure
 * - Idempotency: uses requestId to prevent double-sends
 * - TRX balance check: ensures treasury can execute transaction
 * - Email notification to CoreAgent on failures
 * - Firestore ledger/accounting
 */

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { getTronWeb, getTreasuryUsdtBalance, getTreasuryTrxBalance, USDT_CONTRACT_ADDRESS, USDT_DECIMALS, validateTronAddress } from '../utils/tronUtils'
import { sendEmailViaResend, getCoreAgentEmail, generateTreasuryShortfallEmail } from '../utils/resendEmail'

const db = admin.firestore()

/**
 * Withdrawal status types (hard fail + rollback model)
 */
type WithdrawalStatus = 
  | 'DEBITED'                          // User debited, awaiting broadcast
  | 'BROADCAST_FULL'                   // Broadcast succeeded, txId stored
  | 'FAILED_INSUFFICIENT_TREASURY'     // Hard fail: treasury USDT insufficient (no debit)
  | 'FAILED_ZERO_TREASURY'             // Hard fail: treasury USDT = 0 (no debit)
  | 'FAILED_TREASURY_NO_TRX'           // Hard fail: treasury TRX insufficient (no debit)
  | 'FAILED_BROADCAST_REFUNDED'        // Broadcast failed, user refunded
  | 'FAILED_BROADCAST_NEEDS_MANUAL'    // Refund failed - rare but explicit

/**
 * Fixed withdrawal fee (USDT)
 * TODO: Make this configurable
 */
const WITHDRAWAL_FEE_USDT = 0

/**
 * Minimum TRX balance required for treasury to execute TRC-20 transfer
 * TRC-20 transfers typically cost ~10-20 TRX in energy/fees
 */
const MIN_TRX_BALANCE = 10

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
    const { toAddress, amountUSDT, requestId } = data

    // Validate input
    if (!toAddress || typeof toAddress !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'toAddress is required')
    }

    if (!amountUSDT || typeof amountUSDT !== 'number' || amountUSDT <= 0) {
      throw new functions.https.HttpsError('invalid-argument', 'amountUSDT must be a positive number')
    }

    if (!requestId || typeof requestId !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'requestId is required')
    }

    // Validate TRON address format
    if (!validateTronAddress(toAddress)) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid TRON address format')
    }

    const now = admin.firestore.Timestamp.now()
    
    // Use deterministic withdrawal ID for idempotency
    const withdrawalId = `${userId}_${requestId}`
    const withdrawalRef = db.collection('withdrawals').doc(withdrawalId)

    try {
      // 1. Idempotency check: if withdrawal already exists
      const existingSnap = await withdrawalRef.get()
      if (existingSnap.exists) {
        const existingData = existingSnap.data()!
        const existingStatus = existingData.status as WithdrawalStatus
        
        // If already succeeded, return success (idempotent)
        if (existingStatus === 'BROADCAST_FULL') {
          return {
            withdrawalId,
            requestedAmountUSDT: amountUSDT,
            sentAmountUSDT: existingData.sentAmountUSDT || amountUSDT,
            feeUSDT: existingData.feeUSDT || WITHDRAWAL_FEE_USDT,
            treasuryBalanceAtAttemptUSDT: existingData.treasuryBalanceAtAttemptUSDT || 0,
            txId: existingData.txId || null,
            status: 'BROADCAST_FULL',
          }
        }
        
        // If already failed, return failure (idempotent)
        if (existingStatus.startsWith('FAILED_')) {
          return {
            withdrawalId,
            requestedAmountUSDT: amountUSDT,
            sentAmountUSDT: 0,
            feeUSDT: WITHDRAWAL_FEE_USDT,
            treasuryBalanceAtAttemptUSDT: existingData.treasuryBalanceAtAttemptUSDT || 0,
            txId: null,
            status: existingStatus,
          }
        }
        
        // If in progress (DEBITED), reject to prevent double-send
        if (existingStatus === 'DEBITED') {
          throw new functions.https.HttpsError(
            'failed-precondition',
            'Withdrawal in progress. Please wait and try again.',
            { withdrawalId, status: existingStatus }
          )
        }
      }

      // 2. Pre-checks: validate balances BEFORE any debit
      const userAvailableUSDT = await getUserUsdtBalance(userId)
      
      // Check user balance
      if (userAvailableUSDT < amountUSDT + WITHDRAWAL_FEE_USDT) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Insufficient user balance',
          { userAvailableUSDT, requestedAmountUSDT: amountUSDT }
        )
      }

      // Check treasury USDT balance (hard fail: must cover FULL amount)
      const treasuryUsdt = await getTreasuryUsdtBalance()
      const requiredTreasuryUSDT = amountUSDT + WITHDRAWAL_FEE_USDT
      
      if (treasuryUsdt < requiredTreasuryUSDT) {
        // Hard fail: create withdrawal record but do NOT debit user
        const failureStatus: WithdrawalStatus = treasuryUsdt <= WITHDRAWAL_FEE_USDT 
          ? 'FAILED_ZERO_TREASURY' 
          : 'FAILED_INSUFFICIENT_TREASURY'
        
        const withdrawalDoc = {
          id: withdrawalId,
          userId,
          toAddress: toAddress.trim(),
          requestedAmountUSDT: amountUSDT,
          sentAmountUSDT: 0,
          feeUSDT: WITHDRAWAL_FEE_USDT,
          status: failureStatus,
          txId: null,
          treasuryBalanceAtAttemptUSDT: treasuryUsdt,
          createdAt: now,
          updatedAt: now,
        }
        
        await withdrawalRef.set(withdrawalDoc)

        // Send email to CoreAgent
        const userInfo = await getUserInfo(userId)
        const emailHtml = generateTreasuryShortfallEmail(
          withdrawalId,
          userId,
          userInfo.handle,
          userInfo.email,
          toAddress.trim(),
          amountUSDT,
          0, // sentAmountUSDT
          treasuryUsdt,
          amountUSDT, // shortfallUSDT (full amount)
          null, // txId
          now
        )

        try {
          await sendEmailViaResend(
            getCoreAgentEmail(),
            `Treasury Shortfall: Withdrawal Failed - ${failureStatus === 'FAILED_ZERO_TREASURY' ? 'Zero Treasury' : 'Insufficient Treasury'}`,
            emailHtml
          )
        } catch (emailError: any) {
          console.error('[tx_withdrawTronUSDT] Failed to send email:', emailError)
        }

        // Return failure (no debit)
        return {
          withdrawalId,
          requestedAmountUSDT: amountUSDT,
          sentAmountUSDT: 0,
          feeUSDT: WITHDRAWAL_FEE_USDT,
          treasuryBalanceAtAttemptUSDT: treasuryUsdt,
          txId: null,
          status: failureStatus,
        }
      }

      // Check treasury TRX balance (hard fail: must have enough TRX to execute)
      const treasuryTRX = await getTreasuryTrxBalance()
      
      if (treasuryTRX < MIN_TRX_BALANCE) {
        // Hard fail: create withdrawal record but do NOT debit user
        const withdrawalDoc = {
          id: withdrawalId,
          userId,
          toAddress: toAddress.trim(),
          requestedAmountUSDT: amountUSDT,
          sentAmountUSDT: 0,
          feeUSDT: WITHDRAWAL_FEE_USDT,
          status: 'FAILED_TREASURY_NO_TRX' as WithdrawalStatus,
          txId: null,
          treasuryBalanceAtAttemptUSDT: treasuryUsdt,
          createdAt: now,
          updatedAt: now,
        }
        
        await withdrawalRef.set(withdrawalDoc)

        // Send email to CoreAgent
        const userInfo = await getUserInfo(userId)
        try {
          await sendEmailViaResend(
            getCoreAgentEmail(),
            `Treasury Shortfall: Withdrawal Failed - Insufficient TRX`,
            `
              <h2>Treasury TRX Shortfall</h2>
              <p>Withdrawal failed because treasury has insufficient TRX to execute transaction.</p>
              <p><strong>Withdrawal ID:</strong> ${withdrawalId}</p>
              <p><strong>User ID:</strong> ${userId}</p>
              <p><strong>User Handle:</strong> ${userInfo.handle || 'N/A'}</p>
              <p><strong>Requested Amount:</strong> ${amountUSDT.toFixed(6)} USDT</p>
              <p><strong>Treasury USDT Balance:</strong> ${treasuryUsdt.toFixed(6)} USDT</p>
              <p><strong>Treasury TRX Balance:</strong> ${treasuryTRX.toFixed(6)} TRX</p>
              <p><strong>Required TRX:</strong> ${MIN_TRX_BALANCE} TRX</p>
              <p>Please top up treasury TRX balance.</p>
            `
          )
        } catch (emailError: any) {
          console.error('[tx_withdrawTronUSDT] Failed to send email:', emailError)
        }

        // Return failure (no debit)
        return {
          withdrawalId,
          requestedAmountUSDT: amountUSDT,
          sentAmountUSDT: 0,
          feeUSDT: WITHDRAWAL_FEE_USDT,
          treasuryBalanceAtAttemptUSDT: treasuryUsdt,
          txId: null,
          status: 'FAILED_TREASURY_NO_TRX',
        }
      }

      // 3. All pre-checks passed: proceed with two-phase withdrawal
      const walletRef = db.collection('users').doc(userId).collection('wallets').doc('cashZAR')
      let txId: string | null = null

      // Phase 1: Atomic Firestore transaction - debit user and create withdrawal record
      await db.runTransaction(async (t) => {
        // Re-check withdrawal doesn't exist (double-check idempotency)
        const existingCheck = await t.get(withdrawalRef)
        if (existingCheck.exists) {
          const existingStatus = existingCheck.data()!.status as WithdrawalStatus
          if (existingStatus === 'DEBITED' || existingStatus === 'BROADCAST_FULL') {
            throw new functions.https.HttpsError(
              'failed-precondition',
              'Withdrawal already in progress or completed'
            )
          }
        }

        // Read current wallet balance
        const walletSnap = await t.get(walletRef)
        const currentBalance = walletSnap.data()?.usdtBalance || 0

        // Verify balance hasn't changed (double-spend protection)
        if (currentBalance < amountUSDT + WITHDRAWAL_FEE_USDT) {
          throw new functions.https.HttpsError(
            'failed-precondition',
            'Insufficient balance (changed during transaction)'
          )
        }

        // Debit user balance
        const newBalance = currentBalance - (amountUSDT + WITHDRAWAL_FEE_USDT)
        t.update(walletRef, {
          usdtBalance: newBalance,
          updatedAt: now,
        })

        // Create withdrawal record with status DEBITED
        const withdrawalDoc = {
          id: withdrawalId,
          userId,
          toAddress: toAddress.trim(),
          requestedAmountUSDT: amountUSDT,
          sentAmountUSDT: 0, // Will be updated after broadcast
          feeUSDT: WITHDRAWAL_FEE_USDT,
          status: 'DEBITED' as WithdrawalStatus,
          txId: null, // Will be updated after broadcast
          treasuryBalanceAtAttemptUSDT: treasuryUsdt,
          createdAt: now,
          updatedAt: now,
        }
        t.set(withdrawalRef, withdrawalDoc)
      })

      // Phase 2: Broadcast on-chain transfer from treasury
      try {
        const tronWeb = getTronWeb()
        const contract = await tronWeb.contract().at(USDT_CONTRACT_ADDRESS)
        
        // Convert USDT to smallest unit (Sun for TRC-20)
        const amountSun = Math.floor(amountUSDT * Math.pow(10, USDT_DECIMALS))
        
        console.log(`[tx_withdrawTronUSDT] Broadcasting ${amountUSDT} USDT to ${toAddress.trim()}`)
        
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

        // Update withdrawal record: broadcast succeeded
        await withdrawalRef.update({
          status: 'BROADCAST_FULL',
          sentAmountUSDT: amountUSDT,
          txId,
          updatedAt: admin.firestore.Timestamp.now(),
        })

        console.log(`[tx_withdrawTronUSDT] USDT sent successfully. TxHash: ${txId}`)
      } catch (broadcastError: any) {
        console.error('[tx_withdrawTronUSDT] Error broadcasting transaction:', broadcastError)
        
        // Phase 3: Rollback - refund user balance
        try {
          await db.runTransaction(async (t) => {
            const walletSnap = await t.get(walletRef)
            const currentBalance = walletSnap.data()?.usdtBalance || 0
            
            // Refund user balance
            const refundedBalance = currentBalance + (amountUSDT + WITHDRAWAL_FEE_USDT)
            t.update(walletRef, {
              usdtBalance: refundedBalance,
              updatedAt: admin.firestore.Timestamp.now(),
            })
            
            // Update withdrawal status: refunded
            t.update(withdrawalRef, {
              status: 'FAILED_BROADCAST_REFUNDED',
              updatedAt: admin.firestore.Timestamp.now(),
            })
          })
          
          console.log(`[tx_withdrawTronUSDT] User refunded successfully after broadcast failure`)
          
          // Send email to CoreAgent about broadcast failure
          const userInfo = await getUserInfo(userId)
          try {
            await sendEmailViaResend(
              getCoreAgentEmail(),
              `Withdrawal Broadcast Failure - User Refunded`,
              `
                <h2>Withdrawal Broadcast Failure</h2>
                <p>Transaction broadcast failed, but user has been refunded.</p>
                <p><strong>Withdrawal ID:</strong> ${withdrawalId}</p>
                <p><strong>User ID:</strong> ${userId}</p>
                <p><strong>User Handle:</strong> ${userInfo.handle || 'N/A'}</p>
                <p><strong>Amount:</strong> ${amountUSDT.toFixed(6)} USDT</p>
                <p><strong>Error:</strong> ${broadcastError.message}</p>
                <p>User balance has been refunded. Please investigate the broadcast failure.</p>
              `
            )
          } catch (emailError: any) {
            console.error('[tx_withdrawTronUSDT] Failed to send email:', emailError)
          }
          
          // Return failure with refunded status
          throw new functions.https.HttpsError(
            'internal',
            'Failed to broadcast transaction. User has been refunded.',
            {
              withdrawalId,
              error: broadcastError.message,
              status: 'FAILED_BROADCAST_REFUNDED',
            }
          )
        } catch (refundError: any) {
          console.error('[tx_withdrawTronUSDT] CRITICAL: Failed to refund user after broadcast failure:', refundError)
          
          // Mark as needs manual intervention
          await withdrawalRef.update({
            status: 'FAILED_BROADCAST_NEEDS_MANUAL',
            updatedAt: admin.firestore.Timestamp.now(),
          })
          
          // Send urgent email to CoreAgent
          const userInfo = await getUserInfo(userId)
          try {
            await sendEmailViaResend(
              getCoreAgentEmail(),
              `URGENT: Withdrawal Refund Failed - Manual Intervention Required`,
              `
                <h2>URGENT: Manual Intervention Required</h2>
                <p>Transaction broadcast failed AND automatic refund failed. User balance needs manual refund.</p>
                <p><strong>Withdrawal ID:</strong> ${withdrawalId}</p>
                <p><strong>User ID:</strong> ${userId}</p>
                <p><strong>User Handle:</strong> ${userInfo.handle || 'N/A'}</p>
                <p><strong>Amount to Refund:</strong> ${amountUSDT.toFixed(6)} USDT + ${WITHDRAWAL_FEE_USDT.toFixed(6)} USDT fee</p>
                <p><strong>Broadcast Error:</strong> ${broadcastError.message}</p>
                <p><strong>Refund Error:</strong> ${refundError.message}</p>
                <p><strong>ACTION REQUIRED:</strong> Manually refund user balance in Firestore.</p>
              `
            )
          } catch (emailError: any) {
            console.error('[tx_withdrawTronUSDT] Failed to send email:', emailError)
          }
          
          throw new functions.https.HttpsError(
            'internal',
            'Failed to broadcast transaction and refund failed. Manual intervention required.',
            {
              withdrawalId,
              broadcastError: broadcastError.message,
              refundError: refundError.message,
              status: 'FAILED_BROADCAST_NEEDS_MANUAL',
            }
          )
        }
      }

      // Success: return withdrawal details
      return {
        withdrawalId,
        requestedAmountUSDT: amountUSDT,
        sentAmountUSDT: amountUSDT, // Always full amount in hard-fail mode
        feeUSDT: WITHDRAWAL_FEE_USDT,
        treasuryBalanceAtAttemptUSDT: treasuryUsdt,
        txId,
        status: 'BROADCAST_FULL',
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

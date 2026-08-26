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
import { getTronWeb, getTreasuryUsdtBalance, getTreasuryTrxBalance, getTreasuryAddress, USDT_CONTRACT_ADDRESS, USDT_DECIMALS, validateTronAddress } from '../utils/tronUtils'
import { sendEmailViaResend, getCoreAgentEmail, generateTreasuryShortfallEmail } from '../utils/resendEmail'
import type { TxStatus } from './state'
import { fetchQuotedMznPerZar } from '../fx/quotedMznZar'

const db = admin.firestore()

/**
 * Withdrawal status types (hard fail + rollback model)
 */
type WithdrawalStatus = 
  | 'BROADCAST_FULL'                   // Broadcast succeeded, user debited, txId stored
  | 'FAILED_INSUFFICIENT_TREASURY'     // Hard fail: treasury USDT insufficient (no debit)
  | 'FAILED_ZERO_TREASURY'             // Hard fail: treasury USDT = 0 (no debit)
  | 'FAILED_TREASURY_NO_TRX'           // Hard fail: treasury TRX insufficient (no debit)
  | 'FAILED_BROADCAST'                  // Broadcast failed (no debit)
  | 'FAILED_BROADCAST_NEEDS_MANUAL'    // Broadcast succeeded but debit failed - manual reconciliation required

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
 * Temporary fixed exchange rate: ZAR per USDT
 * TODO: Make this configurable or fetch from external source
 */
const FX_RATE_ZAR_PER_USDT = 18.1

/**
 * Get user available USDT balance derived from fiatBalance (MZN)
 * 
 * Converts fiatBalance (MZN) through ZAR to USDT using fixed exchange rates.
 * Only considers fiatBalance (available balance), not lockedBalance.
 * 
 * This matches the primary MZN cash-in flow.
 */
async function getUserUsdtBalance(userId: string, fxRateMZNperZAR: number): Promise<number> {
  const walletRef = db.collection('users').doc(userId).collection('wallets').doc('cashMZN')
  const walletSnap = await walletRef.get()
  
  if (!walletSnap.exists) {
    return 0
  }
  
  const walletData = walletSnap.data()
  const fiatBalance = walletData?.fiatBalance || 0
  
  // Convert MZN → ZAR → USDT.
  // Only use fiatBalance (available), not lockedBalance (locked for settlement)
  const availableUsdt = fiatBalance / fxRateMZNperZAR / FX_RATE_ZAR_PER_USDT
  
  return availableUsdt
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

/**
 * Create transaction document and messages for withdrawal chat
 * Uses same format as deposit transactions
 */
async function createWithdrawalTransactionAndMessages(
  userId: string,
  chainTxId: string, // TRON transaction hash
  withdrawalId: string,
  amountUSDT: number,
  amountMZN_debited: number,
  amountZAR_debited: number,
  toAddress: string,
  timestamp: admin.firestore.Timestamp,
  fxRateMZNperZAR: number
): Promise<void> {
  // Use chainTxId as transaction ID (same as deposit flow uses txId)
  const txRef = db.collection('transactions').doc(chainTxId)
  
  // Check if transaction already exists (idempotency)
  const existingTx = await txRef.get()
  if (existingTx.exists) {
    console.log(`[createWithdrawalTransactionAndMessages] Transaction ${chainTxId} already exists, skipping`)
    return
  }
  
  const participants = [userId, 'samba']
  
  // Create transaction document (same schema as deposits)
  const transaction = {
    id: chainTxId,
    type: 'WITHDRAWAL_USDT_TRON' as const,
    userId,
    participants,
    status: 'COMPLETED' as TxStatus, // Withdrawal is immediately completed after broadcast
    createdAt: timestamp,
    statusUpdatedAt: timestamp,
    updatedAt: timestamp,
    amountMzn: amountMZN_debited,
    amountZar: amountZAR_debited,
    amountUSDT: amountUSDT,
    fxRateMZNperZAR,
    fxRateZARperUSDT: FX_RATE_ZAR_PER_USDT,
    network: 'TRON',
    toAddress: toAddress,
    chainTxId: chainTxId, // TRON transaction hash
    withdrawalId: withdrawalId, // Link to /withdrawals/{withdrawalId}
    withdrawal: {}, // Empty object for consistency with deposit schema
  }
  
  // Generate URLs
  const tronScanUrl = `https://tronscan.org/#/transaction/${chainTxId}`
  
  // Format amount for display
  const formattedAmountUSDT = amountUSDT.toFixed(6)
  const addressPreview = `${toAddress.slice(0, 8)}...${toAddress.slice(-6)}`
  
  // Create messages (same format as deposit chat)
  const systemMsgRef = txRef.collection('messages').doc()
  const systemMessage = {
    id: systemMsgRef.id,
    txId: chainTxId,
    createdAt: timestamp,
    senderType: 'SYSTEM' as const,
    text: `Withdrawal completed`,
    metadata: {
      status: 'COMPLETED',
      withdrawalId,
      chainTxId,
    },
  }
  
  const sambaMsg1Ref = txRef.collection('messages').doc()
  const sambaMessage1 = {
    id: sambaMsg1Ref.id,
    txId: chainTxId,
    createdAt: timestamp,
    senderType: 'SAMBA' as const,
    senderUid: 'samba',
    text: `Withdrawal confirmed ✅`,
  }
  
  const sambaMsg2Ref = txRef.collection('messages').doc()
  const sambaMessage2 = {
    id: sambaMsg2Ref.id,
    txId: chainTxId,
    createdAt: timestamp,
    senderType: 'SAMBA' as const,
    senderUid: 'samba',
    text: `Your withdrawal of ${formattedAmountUSDT} USDT to ${addressPreview} was sent.\n\n• View on TronScan: ${tronScanUrl}\n• Proof of payment available (withdrawal ID: ${withdrawalId})`,
    metadata: {
      withdrawalId, // Store withdrawalId in metadata for PDF download
    },
  }
  
  // Write transaction and messages atomically
  await db.runTransaction(async (t) => {
    t.set(txRef, transaction)
    t.set(systemMsgRef, systemMessage)
    t.set(sambaMsg1Ref, sambaMessage1)
    t.set(sambaMsg2Ref, sambaMessage2)
  })
  
  console.log(`[createWithdrawalTransactionAndMessages] Created transaction ${chainTxId} and messages for withdrawal ${withdrawalId}`)
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

    const fxRateMZNperZAR = await fetchQuotedMznPerZar()

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
        
        // If in progress (shouldn't happen with new flow, but check anyway)
        // Status should be either BROADCAST_FULL or one of the FAILED_* statuses
        // If it's neither, it's an unexpected state
        const validStatuses: WithdrawalStatus[] = ['BROADCAST_FULL', 'FAILED_INSUFFICIENT_TREASURY', 'FAILED_ZERO_TREASURY', 'FAILED_TREASURY_NO_TRX', 'FAILED_BROADCAST', 'FAILED_BROADCAST_NEEDS_MANUAL']
        if (!validStatuses.includes(existingStatus)) {
          throw new functions.https.HttpsError(
            'failed-precondition',
            'Withdrawal in unexpected state. Please try again.',
            { withdrawalId, status: existingStatus }
          )
        }
      }

      // 2. Pre-checks: validate balances BEFORE any debit
      // Read wallet to get fiatBalance for conversion and logging
      const preCheckWalletRef = db.collection('users').doc(userId).collection('wallets').doc('cashMZN')
      const preCheckWalletSnap = await preCheckWalletRef.get()
      const preCheckWalletData = preCheckWalletSnap.exists ? preCheckWalletSnap.data()! : {}
      
      const fiatBalance = preCheckWalletData?.fiatBalance || 0
      const lockedBalance = preCheckWalletData?.lockedBalance || 0
      
      // Convert fiatBalance (MZN) to available USDT
      const userAvailableUSDT = await getUserUsdtBalance(userId, fxRateMZNperZAR)
      
      // Calculate required ZAR debit amount
      const requiredUSDT = amountUSDT + WITHDRAWAL_FEE_USDT
      const requiredZARDebit = requiredUSDT * FX_RATE_ZAR_PER_USDT
      const requiredMZNDebit = requiredZARDebit * fxRateMZNperZAR
      
      // DETERMINISTIC LOGGING: Log all balance details before checks
      console.log('[tx_withdrawTronUSDT] Balance diagnostics:', {
        userId,
        fiatBalance,
        lockedBalance,
        fxRate: FX_RATE_ZAR_PER_USDT,
        computedAvailableUsdt: userAvailableUSDT,
        requestedAmountUsdt: amountUSDT,
        withdrawalFeeUSDT: WITHDRAWAL_FEE_USDT,
        requiredUsdt: requiredUSDT,
        requiredZarDebit: requiredZARDebit,
        requiredMznDebit: requiredMZNDebit,
        walletPath: `users/${userId}/wallets/cashMZN`,
      })
      
      // Check user balance (derived from fiatBalance)
      if (userAvailableUSDT < requiredUSDT) {
        console.error('[tx_withdrawTronUSDT] Insufficient user balance:', {
          userId,
          fiatBalance,
          lockedBalance,
          fxRate: FX_RATE_ZAR_PER_USDT,
          computedAvailableUsdt: userAvailableUSDT,
          requestedAmountUsdt: amountUSDT,
          requiredUsdt: requiredUSDT,
          requiredZarDebit: requiredZARDebit,
          requiredMznDebit: requiredMZNDebit,
        })
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Insufficient user balance',
          { userAvailableUSDT, requestedAmountUSDT: amountUSDT }
        )
      }

      // Check treasury USDT balance (hard fail: must cover FULL amount)
      const treasuryUsdt = await getTreasuryUsdtBalance()
      
      // DIAGNOSTIC: Log treasury details
      const treasuryAddress = getTreasuryAddress()
      console.log('[tx_withdrawTronUSDT] Treasury diagnostics:', {
        treasuryAddress,
        treasuryUsdt,
        requiredTreasuryUSDT: amountUSDT + WITHDRAWAL_FEE_USDT,
        contractAddress: USDT_CONTRACT_ADDRESS,
      })
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
          amountZAR_debited: 0, // No debit on failure
          fxRate: FX_RATE_ZAR_PER_USDT,
          network: 'TRON',
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
          amountZAR_debited: 0, // No debit on failure
          fxRate: FX_RATE_ZAR_PER_USDT,
          network: 'TRON',
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

      // 3. All pre-checks passed: proceed with atomic withdrawal (broadcast first, then debit)
      const walletRef = db.collection('users').doc(userId).collection('wallets').doc('cashMZN')
      let txId: string | null = null

      // Phase 1: Broadcast on-chain transfer from treasury FIRST (before debiting user)
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

        console.log(`[tx_withdrawTronUSDT] Broadcast succeeded. TxHash: ${txId}`)
      } catch (broadcastError: any) {
        console.error('[tx_withdrawTronUSDT] Error broadcasting transaction:', broadcastError)
        
        // Broadcast failed: create withdrawal record with FAILED_BROADCAST status (NO DEBIT)
        const withdrawalDoc = {
          id: withdrawalId,
          userId,
          toAddress: toAddress.trim(),
          requestedAmountUSDT: amountUSDT,
          sentAmountUSDT: 0,
          feeUSDT: WITHDRAWAL_FEE_USDT,
          amountZAR_debited: 0, // No debit on failure
          fxRate: FX_RATE_ZAR_PER_USDT,
          network: 'TRON',
          status: 'FAILED_BROADCAST' as WithdrawalStatus,
          txId: null,
          treasuryBalanceAtAttemptUSDT: treasuryUsdt,
          createdAt: now,
          updatedAt: now,
        }
        
        await withdrawalRef.set(withdrawalDoc)
        
        // Send email to CoreAgent about broadcast failure
        const userInfo = await getUserInfo(userId)
        try {
          await sendEmailViaResend(
            getCoreAgentEmail(),
            `Withdrawal Broadcast Failure - No Debit`,
            generateTreasuryShortfallEmail(
              withdrawalId,
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
          )
        } catch (emailError: any) {
          console.error('[tx_withdrawTronUSDT] Failed to send email:', emailError)
        }
        
        // Return failure (no debit)
        throw new functions.https.HttpsError(
          'internal',
          'Failed to broadcast transaction. User was not debited.',
          {
            withdrawalId,
            error: broadcastError.message,
            status: 'FAILED_BROADCAST',
          }
        )
      }

      // Phase 2: Broadcast succeeded - now debit user and create withdrawal record atomically
      try {
        await db.runTransaction(async (t) => {
          // Re-check withdrawal doesn't exist (double-check idempotency)
          const existingCheck = await t.get(withdrawalRef)
          if (existingCheck.exists) {
            const existingStatus = existingCheck.data()!.status as WithdrawalStatus
            if (existingStatus === 'BROADCAST_FULL') {
              // Already completed - return success
              return
            }
            if (!existingStatus.startsWith('FAILED_')) {
              throw new functions.https.HttpsError(
                'failed-precondition',
                'Withdrawal already in progress'
              )
            }
          }

          // Read current wallet balance (fiatBalance in MZN)
          const walletSnap = await t.get(walletRef)
          const walletData = walletSnap.exists ? walletSnap.data()! : {}
          const currentFiatBalance = walletData?.fiatBalance || 0

          // Calculate required MZN debit through the ZAR quote.
          const requiredUSDT = amountUSDT + WITHDRAWAL_FEE_USDT
          const requiredZARDebit = requiredUSDT * FX_RATE_ZAR_PER_USDT
          const requiredMZNDebit = requiredZARDebit * fxRateMZNperZAR

          // Verify balance hasn't changed (double-spend protection)
          if (currentFiatBalance < requiredMZNDebit) {
            throw new functions.https.HttpsError(
              'failed-precondition',
              'Insufficient balance (changed during transaction)'
            )
          }

          // Debit user fiatBalance (MZN)
          const newFiatBalance = currentFiatBalance - requiredMZNDebit
          t.update(walletRef, {
            fiatBalance: newFiatBalance,
            updatedAt: admin.firestore.Timestamp.now(),
          })

          // Create withdrawal record with status BROADCAST_FULL (broadcast already succeeded)
          const withdrawalDoc = {
            id: withdrawalId,
            userId,
            toAddress: toAddress.trim(),
            requestedAmountUSDT: amountUSDT,
            sentAmountUSDT: amountUSDT,
            feeUSDT: WITHDRAWAL_FEE_USDT,
            amountMZN_debited: requiredMZNDebit,
            amountZAR_debited: requiredZARDebit,
            fxRateMZNperZAR,
            fxRate: FX_RATE_ZAR_PER_USDT,
            network: 'TRON',
            status: 'BROADCAST_FULL' as WithdrawalStatus,
            txId,
            treasuryBalanceAtAttemptUSDT: treasuryUsdt,
            createdAt: now,
            updatedAt: admin.firestore.Timestamp.now(),
          }
          t.set(withdrawalRef, withdrawalDoc)
        })
        
        console.log(`[tx_withdrawTronUSDT] User debited and withdrawal record created. TxHash: ${txId}`)
        
        // Create transaction document and messages for chat (non-blocking, after debit succeeds)
        // Only create if txId exists (should always be set at this point)
        if (txId) {
          try {
            await createWithdrawalTransactionAndMessages(
              userId,
              txId,
              withdrawalId,
              amountUSDT,
              requiredMZNDebit,
              requiredZARDebit,
              toAddress.trim(),
              now,
              fxRateMZNperZAR
            )
          } catch (chatError: any) {
            // Log but don't fail withdrawal if chat creation fails
            console.error('[tx_withdrawTronUSDT] Failed to create transaction/messages for chat (non-blocking):', chatError)
          }
        }
      } catch (debitError: any) {
        console.error('[tx_withdrawTronUSDT] CRITICAL: Broadcast succeeded but debit failed:', debitError)
        
        // Broadcast succeeded but Firestore debit failed - mark for manual reconciliation
        await withdrawalRef.set({
          id: withdrawalId,
          userId,
          toAddress: toAddress.trim(),
          requestedAmountUSDT: amountUSDT,
          sentAmountUSDT: amountUSDT, // Broadcast succeeded
          feeUSDT: WITHDRAWAL_FEE_USDT,
          status: 'FAILED_BROADCAST_NEEDS_MANUAL' as WithdrawalStatus,
          txId, // Transaction was broadcast successfully
          treasuryBalanceAtAttemptUSDT: treasuryUsdt,
          createdAt: now,
          updatedAt: admin.firestore.Timestamp.now(),
        }, { merge: true })
        
        // Send urgent email to CoreAgent
        const userInfo = await getUserInfo(userId)
        try {
          await sendEmailViaResend(
            getCoreAgentEmail(),
            `URGENT: Withdrawal Debit Failed After Broadcast - Manual Reconciliation Required`,
            `
              <h2>URGENT: Manual Reconciliation Required</h2>
              <p>Transaction was broadcast successfully, but Firestore debit failed. User was NOT debited but funds were sent.</p>
              <p><strong>Withdrawal ID:</strong> ${withdrawalId}</p>
              <p><strong>User ID:</strong> ${userId}</p>
              <p><strong>User Handle:</strong> ${userInfo.handle || 'N/A'}</p>
              <p><strong>TxID:</strong> ${txId}</p>
              <p><strong>Amount Sent:</strong> ${amountUSDT.toFixed(6)} USDT</p>
              <p><strong>Fee:</strong> ${WITHDRAWAL_FEE_USDT.toFixed(6)} USDT</p>
              <p><strong>Debit Error:</strong> ${debitError.message}</p>
              <p><strong>ACTION REQUIRED:</strong> Manually debit user balance in Firestore: ${amountUSDT + WITHDRAWAL_FEE_USDT} USDT</p>
            `
          )
        } catch (emailError: any) {
          console.error('[tx_withdrawTronUSDT] Failed to send email:', emailError)
        }
        
        throw new functions.https.HttpsError(
          'internal',
          'Transaction broadcast succeeded but debit failed. Manual reconciliation required.',
          {
            withdrawalId,
            txId,
            debitError: debitError.message,
            status: 'FAILED_BROADCAST_NEEDS_MANUAL',
          }
        )
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

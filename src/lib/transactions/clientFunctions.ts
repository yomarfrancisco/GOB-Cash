/**
 * Client-side wrappers for transaction Cloud Functions
 * Pattern matches existing repairMyHandle usage
 */

import { getFunctions, httpsCallable } from 'firebase/functions'
import { getFirebaseApp } from '@/lib/firebase'

/**
 * Helper to get functions instance with correct region
 * IMPORTANT: Must use the same app instance to ensure proper callable endpoint resolution
 */
function getFunctionsInstance() {
  const app = getFirebaseApp()
  
  // Verify app is properly initialized
  if (!app || !app.options.projectId) {
    throw new Error('[Functions] Firebase app not properly initialized - missing projectId')
  }
  
  // Get Functions instance - this must use the same app instance
  // Using a new Functions instance each time ensures proper endpoint resolution
  const functions = getFunctions(app, 'us-central1')
  
  return functions
}

/**
 * Append a user message to a transaction thread
 * Cloud Function writes the message to transactions/{txId}/messages
 */
export async function tx_appendUserMessage(txId: string, text: string): Promise<void> {
  const functions = getFunctionsInstance()
  const fn = httpsCallable(functions, 'tx_appendUserMessage')
  
  try {
    await fn({ txId, text })
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Transaction] User message appended to transaction thread:', txId)
    }
  } catch (error: any) {
    console.error('[Transaction] Failed to append user message:', {
      txId,
      errorCode: error?.code,
      errorMessage: error?.message,
    })
    throw error
  }
}

/**
 * Append a Samba/system message to a transaction thread
 * Cloud Function writes the message to transactions/{txId}/messages
 */
export async function tx_appendSambaMessage(txId: string, text: string): Promise<void> {
  const functions = getFunctionsInstance()
  const fn = httpsCallable(functions, 'tx_appendSambaMessage')
  
  try {
    await fn({ txId, text })
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Transaction] Samba message appended to transaction thread:', txId)
    }
  } catch (error: any) {
    console.error('[Transaction] Failed to append Samba message:', {
      txId,
      errorCode: error?.code,
      errorMessage: error?.message,
    })
    throw error
  }
}

/**
 * Append an Ema (AI assistant) message to a transaction thread
 * Cloud Function writes the message to transactions/{txId}/messages
 * Used for acknowledgements and confirmations
 */
export async function tx_appendEmaMessage(txId: string, text: string): Promise<void> {
  const functions = getFunctionsInstance()
  const fn = httpsCallable(functions, 'tx_appendEmaMessage')
  
  try {
    await fn({ txId, text })
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Transaction] Ema message appended to transaction thread:', txId)
    }
  } catch (error: any) {
    console.error('[Transaction] Failed to append Ema message:', {
      txId,
      errorCode: error?.code,
      errorMessage: error?.message,
    })
    throw error
  }
}

/**
 * User marks deposit as sent
 * Transitions: AWAITING_DEPOSIT -> DEPOSIT_SENT
 */
export async function tx_userMarkDepositSent(txId: string, reference?: string): Promise<void> {
  const functions = getFunctionsInstance()
  const fn = httpsCallable(functions, 'tx_userMarkDepositSent')
  
  try {
    await fn({ txId, reference })
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Transaction] User marked deposit as sent:', txId)
    }
  } catch (error: any) {
    console.error('[Transaction] Failed to mark deposit sent:', {
      txId,
      errorCode: error?.code,
      errorMessage: error?.message,
    })
    throw error
  }
}

/**
 * Receiver confirms deposit was received
 * Transitions: DEPOSIT_SENT -> DEPOSIT_RECEIVED
 */
export async function tx_receiverConfirmDeposit(txId: string): Promise<void> {
  const functions = getFunctionsInstance()
  const fn = httpsCallable(functions, 'tx_receiverConfirmDeposit')
  
  try {
    await fn({ txId })
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Transaction] Receiver confirmed deposit:', txId)
    }
  } catch (error: any) {
    console.error('[Transaction] Failed to confirm deposit:', {
      txId,
      errorCode: error?.code,
      errorMessage: error?.message,
    })
    throw error
  }
}

/**
 * User sets withdrawal address
 * Transitions: READY_FOR_WITHDRAWAL -> WITHDRAWAL_REQUESTED
 */
export async function tx_setWithdrawalAddress(txId: string, tronAddress: string): Promise<void> {
  const functions = getFunctionsInstance()
  const fn = httpsCallable(functions, 'tx_setWithdrawalAddress')
  
  try {
    await fn({ txId, tronAddress })
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Transaction] User set withdrawal address:', txId)
    }
  } catch (error: any) {
    console.error('[Transaction] Failed to set withdrawal address:', {
      txId,
      errorCode: error?.code,
      errorMessage: error?.message,
    })
    throw error
  }
}

/**
 * User sets withdrawal address candidate during deposit chat flow
 * Updates withdrawalAddressCandidate and chatStep server-side
 * Used for WAITING_FOR_WALLET_ADDRESS and WAITING_FOR_AGENT_CONFIRMATION transitions
 */
export async function tx_setWithdrawalAddressCandidate(
  txId: string,
  tronAddress: string,
  chatStep: 'WAITING_FOR_WALLET_ADDRESS' | 'WAITING_FOR_AGENT_CONFIRMATION'
): Promise<{ ok: boolean; chatStep: string; withdrawalAddressCandidate: string }> {
  const functions = getFunctionsInstance()
  const fn = httpsCallable(functions, 'tx_setWithdrawalAddressCandidate')
  
  try {
    const result = await fn({ txId, tronAddress, chatStep })
    const data = result.data as { ok: boolean; chatStep: string; withdrawalAddressCandidate: string }
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Transaction] User set withdrawal address candidate:', { txId, chatStep })
    }
    return data
  } catch (error: any) {
    console.error('[Transaction] Failed to set withdrawal address candidate:', {
      txId,
      chatStep,
      errorCode: error?.code,
      errorMessage: error?.message,
    })
    throw error
  }
}

/**
 * User confirms withdrawal (must type "CONFIRM")
 * Transitions: WITHDRAWAL_REQUESTED -> WITHDRAWAL_CONFIRMED
 */
export async function tx_userConfirmWithdrawal(txId: string, confirmText: string): Promise<void> {
  const functions = getFunctionsInstance()
  const fn = httpsCallable(functions, 'tx_userConfirmWithdrawal')
  
  try {
    await fn({ txId, confirmText })
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Transaction] User confirmed withdrawal:', txId)
    }
  } catch (error: any) {
    console.error('[Transaction] Failed to confirm withdrawal:', {
      txId,
      errorCode: error?.code,
      errorMessage: error?.message,
    })
    throw error
  }
}

/**
 * Receiver sends USDT (TRON)
 * Transitions: WITHDRAWAL_CONFIRMED -> WITHDRAWAL_SENT -> COMPLETED
 */
export async function tx_sendUsdtTron(txId: string): Promise<void> {
  const functions = getFunctionsInstance()
  const fn = httpsCallable(functions, 'tx_sendUsdtTron')
  
  try {
    await fn({ txId })
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Transaction] USDT sent (TRON):', txId)
    }
  } catch (error: any) {
    console.error('[Transaction] Failed to send USDT:', {
      txId,
      errorCode: error?.code,
      errorMessage: error?.message,
    })
    throw error
  }
}

/**
 * Raise a dispute on a transaction
 * Transitions transaction to DISPUTED state
 */
export async function tx_raiseDispute(txId: string, reason: string): Promise<void> {
  const functions = getFunctionsInstance()
  const fn = httpsCallable(functions, 'tx_raiseDispute')
  
  try {
    await fn({ txId, reason })
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Transaction] Dispute raised for transaction:', txId)
    }
  } catch (error: any) {
    console.error('[Transaction] Failed to raise dispute:', {
      txId,
      errorCode: error?.code,
      errorMessage: error?.message,
    })
    throw error
  }
}

/**
 * Create a bank deposit transaction request
 * Creates transaction with AWAITING_DEPOSIT status
 * 
 * IMPORTANT: Uses httpsCallable (Firebase SDK) - NOT fetch/axios
 * This ensures proper CORS handling and authentication
 */
type CreateBankDepositRequestParams = {
  receiverId: string
  amountZar: number
  bankCountry?: string
  bankId?: string
  depositCurrency?: string
  depositReference?: string
  depositDetails?: any
  chatStep?: string
  participants?: string[]
}

export async function tx_createBankDepositRequest(
  params: CreateBankDepositRequestParams
): Promise<{ txId: string; status: string }> {
  // Get Firebase app instance (uses env vars, no hardcoded URLs)
  const app = getFirebaseApp()
  
  // Verify app is initialized correctly
  if (!app || !app.options.projectId) {
    throw new Error('[Transaction] Firebase app not properly initialized')
  }
  
  // CRITICAL: Get Functions instance using the helper to ensure proper initialization
  // This ensures the Functions instance is properly configured for callable endpoints
  const functions = getFunctionsInstance()
  
  // Verify Functions instance is valid
  if (!functions) {
    throw new Error('[Transaction] Firebase Functions instance not properly initialized')
  }
  
  // Create callable function reference
  // This uses Firebase's callable endpoint (firebaseremoteconfig.googleapis.com pattern)
  // NOT the direct cloudfunctions.net URL
  const fn = httpsCallable(functions, 'tx_createBankDepositRequest')
  
  try {
    // Log for debugging (will show in console)
    if (typeof window !== 'undefined') {
      console.log('[Transaction] Calling tx_createBankDepositRequest via httpsCallable', {
        projectId: app.options.projectId,
        region: 'us-central1',
        functionName: 'tx_createBankDepositRequest',
        appName: app.name,
      })
    }
    
    // Call function via Firebase SDK (handles CORS, auth, etc.)
    // This should NOT hit cloudfunctions.net directly
    // The SDK will use: https://us-central1-gobankless-dev.cloudfunctions.net/callable/tx_createBankDepositRequest
    // OR the Firebase Remote Config endpoint pattern
    const result = await fn(params)
    const data = result.data as { txId: string; status: string }
    
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Transaction] Bank deposit request created via httpsCallable:', data)
    }
    
    return data
  } catch (error: any) {
    console.error('[Transaction] Failed to create bank deposit request:', {
      receiverId: params.receiverId,
      amountZar: params.amountZar,
      errorCode: error?.code,
      errorMessage: error?.message,
      projectId: app.options.projectId,
      // Log that we're using httpsCallable, not fetch
      method: 'httpsCallable',
      // Log the actual error details
      errorDetails: error?.details || error,
    })
    throw error
  }
}

export interface SetCoreAgentBalanceParams {
  amountZAR: number
}

export async function setCoreAgentBalance(
  params: SetCoreAgentBalanceParams
): Promise<{ success: boolean; amountZAR: number; verifiedBalance: number }> {
  const app = getFirebaseApp()
  const functions = getFunctionsInstance()
  const fn = httpsCallable(functions, 'setCoreAgentBalance')
  
  console.log('[setCoreAgentBalance] Setting balance to', params.amountZAR)
  const result = await fn(params)
  const data = result.data as { success: boolean; amountZAR: number; verifiedBalance: number }
  console.log('[setCoreAgentBalance] Success:', data)
  return data
}

export interface SeedCoreAgentBalanceParams {
  amountZAR: number
}

export async function seedCoreAgentBalance(
  params: SeedCoreAgentBalanceParams
): Promise<{ success: boolean; uid: string; walletId: string; amountZAR: number }> {
  const app = getFirebaseApp()
  
  if (!app || !app.options.projectId) {
    throw new Error('[Transaction] Firebase app not properly initialized')
  }
  
  const functions = getFunctionsInstance()
  
  if (!functions) {
    throw new Error('[Transaction] Firebase Functions instance not properly initialized')
  }
  
  const fn = httpsCallable(functions, 'seedCoreAgentBalance')
  
  try {
    console.log('[seedCoreAgentBalance] Calling function', {
      projectId: app.options.projectId,
      region: 'us-central1',
      functionName: 'seedCoreAgentBalance',
      amountZAR: params.amountZAR,
      timestamp: new Date().toISOString(),
    })
    
    const result = await fn(params)
    const data = result.data as { success: boolean; uid: string; walletId: string; amountZAR: number }
    
    console.log('[seedCoreAgentBalance] Function returned:', data)
    
    return data
  } catch (error: any) {
    console.error('[seedCoreAgentBalance] Failed to seed balance:', {
      amountZAR: params.amountZAR,
      errorCode: error?.code,
      errorMessage: error?.message,
      errorDetails: error?.details || error,
      projectId: app.options.projectId,
      method: 'httpsCallable',
      stack: error?.stack,
    })
    throw error
  }
}

export interface CreatePaymentAndSettleParams {
  receiverHandle: string
  amountZAR: number
}

export async function tx_createPaymentAndSettle(
  params: CreatePaymentAndSettleParams
): Promise<{ txId: string; receiverId: string; amountZAR: number; amountUSDT: number }> {
  const app = getFirebaseApp()
  
  if (!app || !app.options.projectId) {
    throw new Error('[Transaction] Firebase app not properly initialized')
  }
  
  const functions = getFunctionsInstance()
  
  if (!functions) {
    throw new Error('[Transaction] Firebase Functions instance not properly initialized')
  }
  
  const fn = httpsCallable(functions, 'tx_createPaymentAndSettle')
  
  try {
    if (typeof window !== 'undefined') {
      console.log('[Transaction] Calling tx_createPaymentAndSettle via httpsCallable', {
        projectId: app.options.projectId,
        region: 'us-central1',
        functionName: 'tx_createPaymentAndSettle',
        receiverHandle: params.receiverHandle,
        amountZAR: params.amountZAR,
      })
    }
    
    const result = await fn(params)
    const data = result.data as { txId: string; receiverId: string; amountZAR: number; amountUSDT: number }
    
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Transaction] Payment created via httpsCallable:', data)
    }
    
    return data
  } catch (error: any) {
    console.error('[Transaction] Failed to create payment:', {
      receiverHandle: params.receiverHandle,
      amountZAR: params.amountZAR,
      errorCode: error?.code,
      errorMessage: error?.message,
      projectId: app.options.projectId,
      method: 'httpsCallable',
      errorDetails: error?.details || error,
    })
    throw error
  }
}

/**
 * Credit and lock funds for a transaction
 * Transitions: DEPOSIT_RECEIVED -> LOCKED
 */
export async function tx_creditAndLock(txId: string): Promise<{ ok: boolean; status: string; unlockAt: number }> {
  const functions = getFunctionsInstance()
  const fn = httpsCallable(functions, 'tx_creditAndLock')
  
  try {
    const result = await fn({ txId })
    const data = result.data as { ok: boolean; status: string; unlockAt: number }
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Transaction] Funds credited and locked:', data)
    }
    return data
  } catch (error: any) {
    console.error('[Transaction] Failed to credit and lock:', {
      txId,
      errorCode: error?.code,
      errorMessage: error?.message,
    })
    throw error
  }
}

/**
 * Ensure user has a TRON address assigned (derived from HD wallet)
 * Idempotent: returns existing address if already assigned
 */
export async function wallet_ensureTronAddress(): Promise<{ address: string; index: number; path: string }> {
  const functions = getFunctionsInstance()
  const fn = httpsCallable(functions, 'wallet_ensureTronAddress')
  
  try {
    const result = await fn({})
    const data = result.data as { address: string; index: number; path: string }
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Wallet] TRON address ensured:', data)
    }
    return data
  } catch (error: any) {
    console.error('[Wallet] Failed to ensure TRON address:', {
      errorCode: error?.code,
      errorMessage: error?.message,
    })
    throw error
  }
}

export interface WithdrawTronUsdtParams {
  toAddress: string
  amountUSDT: number
  requestId?: string // Optional UUID for idempotency (generated client-side if not provided)
}

export interface WithdrawTronUsdtResult {
  withdrawalId: string
  requestedAmountUSDT: number
  sentAmountUSDT: number
  feeUSDT: number
  treasuryBalanceAtAttemptUSDT: number
  txId: string | null
  status: 'DEBITED' | 'BROADCAST_FULL' | 'FAILED_INSUFFICIENT_TREASURY' | 'FAILED_ZERO_TREASURY' | 'FAILED_TREASURY_NO_TRX' | 'FAILED_BROADCAST_REFUNDED' | 'FAILED_BROADCAST_NEEDS_MANUAL'
}

/**
 * Withdraw USDT to TRON address
 * Hard fail only: rejects if treasury cannot cover full amount
 * Idempotent: uses requestId to prevent double-sends
 */
export async function tx_withdrawTronUSDT(
  params: WithdrawTronUsdtParams
): Promise<WithdrawTronUsdtResult> {
  // Verify Firebase app is initialized
  const app = getFirebaseApp()
  if (!app || !app.options.projectId) {
    const error = new Error('[Withdrawal] Firebase app not initialized')
    console.error('[Withdrawal] Firebase app check failed:', {
      hasApp: !!app,
      projectId: app?.options?.projectId,
    })
    throw error
  }

  const functions = getFunctionsInstance()
  
  // Verify Functions instance
  if (!functions) {
    const error = new Error('[Withdrawal] Firebase Functions instance not initialized')
    console.error('[Withdrawal] Functions instance check failed')
    throw error
  }

  // Use httpsCallable (NOT fetch) - this handles CORS automatically
  const fn = httpsCallable(functions, 'tx_withdrawTronUSDT')
  
  // Generate requestId if not provided (for idempotency)
  const requestId = params.requestId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`)
  
  try {
    if (typeof window !== 'undefined') {
      // Log full Firebase config for diagnostics - CRITICAL for debugging CORS
      console.log('[Withdrawal] Firebase config check:', {
        projectId: app.options.projectId,
        authDomain: app.options.authDomain,
        appId: app.options.appId,
        region: 'us-central1',
        functionName: 'tx_withdrawTronUSDT',
        functionsInstance: functions ? 'initialized' : 'null',
        // Log the actual URL pattern that httpsCallable will use
        expectedCallablePattern: `https://us-central1-${app.options.projectId}.cloudfunctions.net/callable/tx_withdrawTronUSDT`,
        directUrlPattern: `https://us-central1-${app.options.projectId}.cloudfunctions.net/tx_withdrawTronUSDT`,
        toAddress: params.toAddress,
        amountUSDT: params.amountUSDT,
        requestId,
        method: 'httpsCallable', // Confirm we're using httpsCallable, not fetch
      })
      
      // CRITICAL: Log the actual Functions instance details to see what URL it will construct
      console.log('[Withdrawal] Functions instance details:', {
        appName: functions.app?.name,
        appOptions: functions.app?.options,
      })
    }
    
    const result = await fn({
      ...params,
      requestId,
    })
    const data = result.data as WithdrawTronUsdtResult
    
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Withdrawal] Withdrawal result:', data)
    }
    
    return data
  } catch (error: any) {
    // Log full error details for debugging
    console.error('[Withdrawal] Failed to withdraw USDT:', {
      toAddress: params.toAddress,
      amountUSDT: params.amountUSDT,
      requestId: params.requestId,
      errorCode: error?.code,
      errorMessage: error?.message,
      errorDetails: error?.details || error,
      projectId: app.options.projectId,
      method: 'httpsCallable', // Confirm we're using httpsCallable
      // Check if it's a CORS error
      isCorsError: error?.message?.includes('CORS') || error?.message?.includes('cors'),
      stack: error?.stack,
    })
    
    // Re-throw with original error (preserves Firebase error codes)
    throw error
  }
}


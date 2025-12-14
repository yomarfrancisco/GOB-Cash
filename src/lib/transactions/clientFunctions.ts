/**
 * Client-side wrappers for transaction Cloud Functions
 * Pattern matches existing repairMyHandle usage
 */

import { getFunctions, httpsCallable } from 'firebase/functions'
import { getFirebaseApp } from '@/lib/firebase'

/**
 * Helper to get functions instance with correct region
 */
function getFunctionsInstance() {
  return getFunctions(getFirebaseApp(), 'us-central1')
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
export async function tx_createBankDepositRequest(
  receiverId: string,
  amountZar: number
): Promise<{ txId: string; status: string }> {
  // Get Firebase app instance (uses env vars, no hardcoded URLs)
  const app = getFirebaseApp()
  
  // Get Functions instance with correct region
  const functions = getFunctions(app, 'us-central1')
  
  // Create callable function reference (uses Firebase Remote Config endpoint, NOT cloudfunctions.net)
  const fn = httpsCallable(functions, 'tx_createBankDepositRequest')
  
  try {
    // Call function via Firebase SDK (handles CORS, auth, etc.)
    const result = await fn({ receiverId, amountZar })
    const data = result.data as { txId: string; status: string }
    
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Transaction] Bank deposit request created via httpsCallable:', data)
    }
    
    return data
  } catch (error: any) {
    console.error('[Transaction] Failed to create bank deposit request:', {
      receiverId,
      amountZar,
      errorCode: error?.code,
      errorMessage: error?.message,
      // Log that we're using httpsCallable, not fetch
      method: 'httpsCallable',
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


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


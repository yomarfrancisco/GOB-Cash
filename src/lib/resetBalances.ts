/**
 * Client wrapper for resetMyBalances Cloud Function
 */

import { getFunctions, httpsCallable } from 'firebase/functions'
import { getFirebaseApp } from './firebase'

/**
 * Reset current user's wallet balances to zero
 */
export async function resetMyBalances(): Promise<void> {
  const functions = getFunctions(getFirebaseApp(), 'us-central1')
  const fn = httpsCallable(functions, 'resetMyBalances')
  
  try {
    const result = await fn({})
    console.log('[Reset] Balances reset:', result.data)
  } catch (error: any) {
    console.error('[Reset] Failed to reset balances:', {
      errorCode: error?.code,
      errorMessage: error?.message,
    })
    throw error
  }
}


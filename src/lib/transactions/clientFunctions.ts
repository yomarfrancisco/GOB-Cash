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


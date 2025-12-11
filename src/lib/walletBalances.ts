/**
 * Wallet balances type matching Firestore schema
 * This is the canonical type for wallet balances across the app.
 */

'use client'

import { doc, updateDoc, getDoc } from 'firebase/firestore'
import { getFirestoreDb, getFirebaseAuth } from './firebase'

export type WalletBalances = {
  ZAR: number
  MZN: number
  ZWD: number
  USDT: number
}

/**
 * Default/zero balances
 */
export const DEFAULT_BALANCES: WalletBalances = {
  ZAR: 0,
  MZN: 0,
  ZWD: 0,
  USDT: 0,
}

/**
 * Update balances in Firestore for the current user
 * 
 * @param balances - Partial or full balances object to update
 * @returns Promise that resolves when update completes
 * @throws Error if user is not authenticated or Firestore operation fails
 */
export async function updateFirestoreBalances(
  balances: Partial<WalletBalances>
): Promise<void> {
  if (typeof window === 'undefined') {
    throw new Error('updateFirestoreBalances must be called client-side only')
  }

  const auth = getFirebaseAuth()
  const user = auth.currentUser

  if (!user) {
    console.warn('[Wallet] Cannot update Firestore balances: user not authenticated')
    return
  }

  const db = getFirestoreDb()
  const userRef = doc(db, 'users', user.uid)

  try {
    // Get current balances to merge
    const userSnap = await getDoc(userRef)
    if (!userSnap.exists()) {
      console.warn('[Wallet] User document does not exist, cannot update balances')
      return
    }

    const currentData = userSnap.data()
    const currentBalances = currentData.balances || DEFAULT_BALANCES

    // Merge with new balances
    const updatedBalances: WalletBalances = {
      ZAR: balances.ZAR !== undefined ? balances.ZAR : currentBalances.ZAR,
      MZN: balances.MZN !== undefined ? balances.MZN : currentBalances.MZN,
      ZWD: balances.ZWD !== undefined ? balances.ZWD : currentBalances.ZWD,
      USDT: balances.USDT !== undefined ? balances.USDT : currentBalances.USDT,
    }

    // Update Firestore
    await updateDoc(userRef, {
      balances: updatedBalances,
    })

    console.log('[Wallet] Updated balances in Firestore:', updatedBalances)
  } catch (error) {
    console.error('[Wallet] Failed to update Firestore balances:', error)
    throw error
  }
}


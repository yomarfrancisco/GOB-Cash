'use client'

import {
  collection,
  doc,
  getDocs,
  setDoc,
  serverTimestamp,
  onSnapshot,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore'
import { type User } from 'firebase/auth'
import { getFirestoreDb } from './firebase'
import { type WalletDoc, type WalletId, type WalletMap } from '@/types/wallet'

/**
 * Collection reference helper
 */
export function getUserWalletsRef(userId: string) {
  const db = getFirestoreDb()
  return collection(db, 'users', userId, 'wallets')
}

/**
 * Default wallet seeds (fiatBalance/usdtBalance start at 0; apy are demo defaults)
 */
const DEFAULT_WALLETS: WalletDoc[] = [
  {
    walletId: 'cashZAR',
    kind: 'cash',
    displayCurrency: 'ZAR',
    fiatBalance: 0,
    usdtBalance: 0,
    apy: 9.38,
  },
  {
    walletId: 'cashMZN',
    kind: 'cash',
    displayCurrency: 'MZN',
    fiatBalance: 0,
    usdtBalance: 0,
    apy: 9.38,
  },
  {
    walletId: 'cashZWD',
    kind: 'cash',
    displayCurrency: 'ZWD',
    fiatBalance: 0,
    usdtBalance: 0,
    apy: 9.38,
  },
  {
    walletId: 'btc',
    kind: 'crypto',
    displayCurrency: 'BTC',
    fiatBalance: 0,
    usdtBalance: 0,
    apy: 0,
  },
  {
    walletId: 'eth',
    kind: 'crypto',
    displayCurrency: 'ETH',
    fiatBalance: 0,
    usdtBalance: 0,
    apy: 0,
  },
  {
    walletId: 'earnings',
    kind: 'earnings',
    displayCurrency: 'ZAR', // For now earnings display in ZAR
    fiatBalance: 0,
    usdtBalance: 0,
    apy: 9.38,
  },
]

/**
 * Reset all wallet balances to zero for a user.
 * This ensures new wallets start with zero balances until real payments infrastructure is connected.
 * Always resets balances to zero, even if they appear to be zero already, to ensure consistency.
 */
export async function resetWalletBalancesToZero(user: User): Promise<void> {
  const db = getFirestoreDb()
  const walletsRef = getUserWalletsRef(user.uid)

  const snapshot = await getDocs(walletsRef)
  if (snapshot.empty) {
    return // No wallets to reset
  }

  const now = serverTimestamp()
  let resetCount = 0
  
  const batch = snapshot.docs.map((docSnap) => {
    const walletData = docSnap.data() as WalletDoc
    const walletRef = doc(db, 'users', user.uid, 'wallets', walletData.walletId)
    
    // Check if balances need resetting (non-zero or undefined/null)
    const needsReset = (walletData.fiatBalance !== undefined && walletData.fiatBalance !== 0) ||
                       (walletData.usdtBalance !== undefined && walletData.usdtBalance !== 0) ||
                       walletData.fiatBalance === undefined ||
                       walletData.usdtBalance === undefined
    
    if (needsReset) {
      resetCount++
      return setDoc(
        walletRef,
        {
          fiatBalance: 0,
          usdtBalance: 0,
          updatedAt: now,
        },
        { merge: true }
      )
    }
    return Promise.resolve()
  })

  await Promise.all(batch)

  if (process.env.NODE_ENV !== 'production') {
    console.log('[Wallets] Reset wallet balances to zero for user', user.uid, `(${resetCount} wallet(s) reset)`)
  }
}

/**
 * Ensure default wallets exist for a user.
 * If the wallets subcollection is empty, seed it.
 * If wallets exist, reset their balances to zero to ensure new wallets start with zero.
 */
export async function ensureDefaultWallets(user: User): Promise<void> {
  const db = getFirestoreDb()
  const walletsRef = getUserWalletsRef(user.uid)

  const snapshot = await getDocs(walletsRef)
  if (!snapshot.empty) {
    // Wallets exist - reset balances to zero to ensure new wallets start with zero
    // This prevents non-zero balances from persisting on refresh
    await resetWalletBalancesToZero(user)
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Wallets] Wallets already exist for user', user.uid, '- reset balances to zero')
    }
    return
  }

  const seeds = DEFAULT_WALLETS.map((w) => ({ ...w }))

  const now = serverTimestamp()
  await Promise.all(
    seeds.map((wallet) => {
      const ref = doc(db, 'users', user.uid, 'wallets', wallet.walletId)
      return setDoc(ref, {
        ...wallet,
        createdAt: now,
        updatedAt: now,
      })
    })
  )

  if (process.env.NODE_ENV !== 'production') {
    console.log('[Wallets] Ensured default wallets for user', user.uid)
  }
}

/**
 * Fetch all wallets for a user.
 */
export async function getWalletsForUser(userId: string): Promise<WalletMap> {
  const walletsRef = getUserWalletsRef(userId)
  const snap = await getDocs(walletsRef)
  const map: Partial<WalletMap> = {}
  snap.forEach((docSnap) => {
    const data = docSnap.data() as WalletDoc
    map[data.walletId] = data
  })
  return map as WalletMap
}

/**
 * Subscribe to wallet snapshots for a user.
 */
export function subscribeToWallets(
  userId: string,
  callback: (wallets: WalletMap) => void
): Unsubscribe {
  const walletsRef = getUserWalletsRef(userId)
  
  console.log('[Wallets] subscribeToWallets: Attaching listener', {
    userId,
    path: `users/${userId}/wallets`,
    timestamp: new Date().toISOString(),
  })
  
  return onSnapshot(walletsRef, (snap) => {
    const map: Partial<WalletMap> = {}
    const walletData: Array<{ id: string; fiatBalance: number; usdtBalance: number }> = []
    
    snap.forEach((docSnap) => {
      const data = docSnap.data() as WalletDoc
      map[data.walletId] = data
      walletData.push({
        id: data.walletId || docSnap.id,
        fiatBalance: data.fiatBalance || 0,
        usdtBalance: data.usdtBalance || 0,
      })
    })
    
    console.log('[Wallets] subscribeToWallets: onSnapshot fired', {
      userId,
      docCount: snap.size,
      walletData,
      timestamp: new Date().toISOString(),
    })
    
    callback(map as WalletMap)
  }, (error) => {
    console.error('[Wallets] subscribeToWallets: Error in onSnapshot', {
      userId,
      error: error.message,
      code: error.code,
      timestamp: new Date().toISOString(),
    })
  })
}

/**
 * Update a wallet doc with new balances (absolute values).
 * 
 * AUDIT LOGGING: All balance writes are logged for debugging.
 */
export async function updateWalletBalances(
  userId: string,
  walletId: WalletId,
  payload: Partial<Pick<WalletDoc, 'fiatBalance' | 'usdtBalance' | 'apy' | 'riskScore' | 'timeLeftDays'>>
): Promise<void> {
  // Audit logging: capture stack trace and caller info
  const stack = new Error().stack
  const caller = stack?.split('\n')[2]?.trim() || 'unknown'
  
  // Check if this is a non-zero write for authed user (potential leak)
  const hasNonZeroBalance = (payload.fiatBalance !== undefined && payload.fiatBalance > 0) ||
                            (payload.usdtBalance !== undefined && payload.usdtBalance > 0)
  
  // Log all writes (especially non-zero for authed users)
  console.log('[Wallets] AUDIT: updateWalletBalances called', {
    userId,
    walletId,
    payload,
    caller,
    hasNonZeroBalance,
    timestamp: new Date().toISOString(),
  })
  
  // If writing non-zero balance, log warning
  if (hasNonZeroBalance) {
    console.warn('[Wallets] AUDIT WARNING: Writing non-zero balance for authed user', {
      userId,
      walletId,
      payload,
      caller,
      stack: stack?.split('\n').slice(0, 5).join('\n'),
    })
  }
  
  const db = getFirestoreDb()
  const ref = doc(db, 'users', userId, 'wallets', walletId)
  await setDoc(
    ref,
    {
      ...payload,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  )
  if (process.env.NODE_ENV !== 'production') {
    console.log('[Wallets] Updated wallet', walletId, payload)
  }
}


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
 * Ensure default wallets exist for a user.
 * If the wallets subcollection is empty, seed it.
 */
export async function ensureDefaultWallets(user: User): Promise<void> {
  const db = getFirestoreDb()
  const walletsRef = getUserWalletsRef(user.uid)

  const snapshot = await getDocs(walletsRef)
  if (!snapshot.empty) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Wallets] Wallets already exist for user', user.uid)
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
  return onSnapshot(walletsRef, (snap) => {
    const map: Partial<WalletMap> = {}
    snap.forEach((docSnap) => {
      const data = docSnap.data() as WalletDoc
      map[data.walletId] = data
    })
    callback(map as WalletMap)
  })
}

/**
 * Update a wallet doc with new balances (absolute values).
 */
export async function updateWalletBalances(
  userId: string,
  walletId: WalletId,
  payload: Partial<Pick<WalletDoc, 'fiatBalance' | 'usdtBalance' | 'apy' | 'riskScore' | 'timeLeftDays'>>
): Promise<void> {
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


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
import { type WalletDoc, type WalletId, type WalletMap, type WalletKind } from '@/types/wallet'

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
 * If the wallets subcollection is empty, seed it. Supports migration from legacy balances map.
 */
export async function ensureDefaultWallets(user: User, legacyBalances?: Record<string, number>): Promise<void> {
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

  // Migration: if legacy balances exist and wallets are empty, hydrate cash wallets
  if (legacyBalances) {
    const { ZAR, MZN, ZWD, USDT } = legacyBalances
    const apply = (walletId: WalletId, value?: number) => {
      const wallet = seeds.find((w) => w.walletId === walletId)
      if (wallet && typeof value === 'number') {
        wallet.fiatBalance = value
      }
    }
    apply('cashZAR', ZAR)
    apply('cashMZN', MZN)
    apply('cashZWD', ZWD)
    // Map USDT into crypto wallets (split evenly between btc/eth for now as safe default)
    if (typeof USDT === 'number' && USDT > 0) {
      const half = USDT / 2
      const eth = seeds.find((w) => w.walletId === 'eth')
      const btc = seeds.find((w) => w.walletId === 'btc')
      if (eth) eth.usdtBalance = half
      if (btc) btc.usdtBalance = USDT - half
    }
  }

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


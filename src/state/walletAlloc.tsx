'use client'

import { createContext, useContext, useState, useCallback, ReactNode, useRef } from 'react'
import { updateFirestoreBalances } from '@/lib/walletBalances'
import type { WalletBalances } from '@/lib/walletBalances'

export type WalletAlloc = {
  totalCents: number // total funds in cents; funds-available display derives from this
  cashCents: number
  ethCents: number
  zwdCents: number
  earningsCents: number // Earnings card balance (separate from ETH)
  mznCents?: number
  btcCents?: number
}

type AllocState = {
  alloc: WalletAlloc
  // during a sequence, disable ambient flips
  isRebalancing: boolean
}

interface WalletAllocContextType {
  alloc: WalletAlloc
  isRebalancing: boolean
  setRebalancing: (value: boolean) => void
  applyAiAction: (action: { from: 'cash' | 'eth' | 'zwd'; to: 'cash' | 'eth' | 'zwd'; cents: number }) => void
  allocPct: (value: number) => number
  // Getters and setters for direct balance updates
  getCash: () => number
  getEth: () => number
  getZwd: () => number
  getEarnings: () => number
  setCash: (value: number) => void
  setEth: (value: number) => void
  setZwd: (value: number) => void
  setEarnings: (value: number) => void
  // Sync from Firestore balances
  syncFromFirestore: (balances: WalletBalances) => void
}

const WalletAllocContext = createContext<WalletAllocContextType | undefined>(undefined)

const initial: WalletAlloc = {
  totalCents: 610300, // R6,103.00 (~337 USDT @ 18.1 FX)
  cashCents: 488240, // 80% of total
  ethCents: 18309, // 3% of total
  zwdCents: 42721, // 7% of total
  earningsCents: 61030, // 10% of total (R610.30) - Earnings card never starts at 0
  mznCents: 0,
  btcCents: 0,
}

export function WalletAllocProvider({ children }: { children: ReactNode }) {
  const [alloc, setAlloc] = useState<WalletAlloc>(initial)
  const [isRebalancing, setRebalancing] = useState(false)
  // Track if we're syncing from Firestore to prevent loops
  const isSyncingFromFirestoreRef = useRef(false)

  const applyAiAction = useCallback(
    (action: { from: 'cash' | 'eth' | 'zwd'; to: 'cash' | 'eth' | 'zwd'; cents: number }) => {
      setAlloc((prev) => {
        const fromKey = `${action.from}Cents` as keyof WalletAlloc
        const toKey = `${action.to}Cents` as keyof WalletAlloc

        const fromValue = prev[fromKey] as number
        const toValue = prev[toKey] as number

        // Clamp: from >= 0, to <= total
        const transferCents = Math.min(action.cents, fromValue)
        const newFromValue = Math.max(0, fromValue - transferCents)
        const newToValue = Math.min(prev.totalCents, toValue + transferCents)

        const newAlloc = {
          ...prev,
          [fromKey]: newFromValue,
          [toKey]: newToValue,
          // totalCents stays constant
        }

        // Persist to Firestore (non-blocking)
        if (typeof window !== 'undefined' && !isSyncingFromFirestoreRef.current) {
          const balances: Partial<WalletBalances> = {}
          if (action.from === 'cash' || action.to === 'cash') {
            balances.ZAR = newAlloc.cashCents / 100
          }
          if (action.from === 'eth' || action.to === 'eth') {
            // ETH is stored as USDT in Firestore (convert from ZAR)
            const fxRate = 18.1 // ZAR per USDT
            balances.USDT = newAlloc.ethCents / 100 / fxRate
          }
          if (action.from === 'zwd' || action.to === 'zwd') {
            balances.ZWD = newAlloc.zwdCents / 100
          }
          
          updateFirestoreBalances(balances).catch((err) => {
            console.error('[Wallet] Failed to persist AI action to Firestore:', err)
          })
        }

        return newAlloc
      })
    },
    []
  )

  const allocPct = useCallback(
    (value: number) => {
      return Math.round((10000 * value) / alloc.totalCents) / 100 // 2-dp % for display
    },
    [alloc.totalCents]
  )

  const getCash = useCallback(() => alloc.cashCents / 100, [alloc.cashCents])
  const getEth = useCallback(() => alloc.ethCents / 100, [alloc.ethCents])
  const getZwd = useCallback(() => alloc.zwdCents / 100, [alloc.zwdCents])
  const getEarnings = useCallback(() => alloc.earningsCents / 100, [alloc.earningsCents])

  const setCash = useCallback(
    (value: number) => {
      setAlloc((prev) => {
        const newCashCents = Math.round(value * 100)
        const newAlloc = { ...prev, cashCents: newCashCents }
        
        // Persist to Firestore (non-blocking)
        if (typeof window !== 'undefined' && !isSyncingFromFirestoreRef.current) {
          updateFirestoreBalances({ ZAR: value }).catch((err) => {
            console.error('[Wallet] Failed to persist ZAR balance to Firestore:', err)
          })
        }
        
        return newAlloc
      })
    },
    []
  )

  const setEth = useCallback(
    (value: number) => {
      setAlloc((prev) => {
        const newEthCents = Math.round(value * 100)
        const newAlloc = { ...prev, ethCents: newEthCents }
        
        // Persist to Firestore (non-blocking)
        // ETH is stored as USDT in Firestore (convert from ZAR)
        if (typeof window !== 'undefined' && !isSyncingFromFirestoreRef.current) {
          const fxRate = 18.1 // ZAR per USDT
          const usdtValue = value / fxRate
          updateFirestoreBalances({ USDT: usdtValue }).catch((err) => {
            console.error('[Wallet] Failed to persist ETH/USDT balance to Firestore:', err)
          })
        }
        
        return newAlloc
      })
    },
    []
  )

  const setZwd = useCallback(
    (value: number) => {
      setAlloc((prev) => {
        const newZwdCents = Math.round(value * 100)
        const newAlloc = { ...prev, zwdCents: newZwdCents }
        
        // Persist to Firestore (non-blocking)
        if (typeof window !== 'undefined' && !isSyncingFromFirestoreRef.current) {
          updateFirestoreBalances({ ZWD: value }).catch((err) => {
            console.error('[Wallet] Failed to persist ZWD balance to Firestore:', err)
          })
        }
        
        return newAlloc
      })
    },
    []
  )

  const setEarnings = useCallback(
    (value: number) => {
      setAlloc((prev) => {
        const newEarningsCents = Math.round(value * 100)
        return { ...prev, earningsCents: newEarningsCents }
      })
    },
    []
  )

  // Sync WalletAlloc from Firestore balances
  const syncFromFirestore = useCallback((balances: WalletBalances) => {
    isSyncingFromFirestoreRef.current = true
    try {
      setAlloc((prev) => {
        const fxRate = 18.1 // ZAR per USDT
        const newAlloc: WalletAlloc = {
          ...prev,
          cashCents: Math.round(balances.ZAR * 100),
          zwdCents: Math.round(balances.ZWD * 100),
          ethCents: Math.round(balances.USDT * fxRate * 100), // Convert USDT to ZAR cents
          mznCents: Math.round(balances.MZN * 100),
          // Recalculate total from balances
          totalCents: Math.round(
            balances.ZAR * 100 +
            balances.ZWD * 100 +
            balances.USDT * fxRate * 100 +
            balances.MZN * 100
          ),
        }
        console.log('[Wallet] Loaded balances from Firestore:', balances)
        return newAlloc
      })
    } finally {
      // Reset flag after a short delay to allow state update to complete
      setTimeout(() => {
        isSyncingFromFirestoreRef.current = false
      }, 100)
    }
  }, [])

  return (
    <WalletAllocContext.Provider
      value={{
        alloc,
        isRebalancing,
        setRebalancing,
        applyAiAction,
        allocPct,
        getCash,
        getEth,
        getZwd,
        getEarnings,
        setCash,
        setEth,
        setZwd,
        setEarnings,
        syncFromFirestore,
      }}
    >
      {children}
    </WalletAllocContext.Provider>
  )
}

export function useWalletAlloc() {
  const context = useContext(WalletAllocContext)
  if (context === undefined) {
    throw new Error('useWalletAlloc must be used within WalletAllocProvider')
  }
  return context
}


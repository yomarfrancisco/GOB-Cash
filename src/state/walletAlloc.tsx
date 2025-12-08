'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

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

        return {
          ...prev,
          [fromKey]: newFromValue,
          [toKey]: newToValue,
          // totalCents stays constant
        }
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
        const diff = newCashCents - prev.cashCents
        // Adjust total to keep it constant (or allow it to change if needed)
        return { ...prev, cashCents: newCashCents }
      })
    },
    []
  )

  const setEth = useCallback(
    (value: number) => {
      setAlloc((prev) => {
        const newEthCents = Math.round(value * 100)
        return { ...prev, ethCents: newEthCents }
      })
    },
    []
  )

  const setZwd = useCallback(
    (value: number) => {
      setAlloc((prev) => {
        const newZwdCents = Math.round(value * 100)
        return { ...prev, zwdCents: newZwdCents }
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


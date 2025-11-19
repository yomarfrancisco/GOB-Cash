import { create } from 'zustand'

export type Holding = {
  symbol: 'CASH' | 'ETH' | 'BTC' | 'PEPE' | string
  amountZAR: number
  amountUSDT: number
  allocationPct: number // 0..100 (high-precision float)
  displayPct: number // 0..100 (integer for pill UI, sums to 100 across all holdings)
  health: number // 0..100 (green bar)
}

type PortfolioState = {
  holdings: Record<string, Holding>
  setHolding: (h: Partial<Holding> & { symbol: string }) => void
  setHoldingsBulk: (holdings: {
    CASH: Partial<Holding> & { symbol: 'CASH' }
    ETH: Partial<Holding> & { symbol: 'ETH' }
    PEPE: Partial<Holding> & { symbol: 'PEPE' }
  }) => void
  getHolding: (symbol: string) => Holding | undefined
}

const initialHoldings: Record<string, Holding> = {
  CASH: {
    symbol: 'CASH',
    amountZAR: 5492.70,
    amountUSDT: 303.464,
    allocationPct: 90,
    displayPct: 90,
    health: 100,
  },
  ETH: {
    symbol: 'ETH',
    amountZAR: 146.98,
    amountUSDT: 8.12,
    allocationPct: 2,
    displayPct: 2,
    health: 60,
  },
  PEPE: {
    symbol: 'PEPE',
    amountZAR: 427.21,
    amountUSDT: 23.6,
    allocationPct: 7,
    displayPct: 7,
    health: 25,
  },
}

export const usePortfolioStore = create<PortfolioState>((set, get) => ({
  holdings: initialHoldings,
  setHolding: (holding) => {
    set((state) => {
      const existing = state.holdings[holding.symbol]
      const updated: Holding = {
        ...existing,
        ...holding,
        symbol: holding.symbol,
      }
      return {
        holdings: {
          ...state.holdings,
          [holding.symbol]: updated,
        },
      }
    })
  },
  setHoldingsBulk: (bulkHoldings) => {
    set((state) => {
      const updated: Record<string, Holding> = { ...state.holdings }
      
      // Update all three holdings atomically
      ;(['CASH', 'ETH', 'PEPE'] as const).forEach((symbol) => {
        const existing = state.holdings[symbol]
        const input = bulkHoldings[symbol]
        updated[symbol] = {
          ...existing,
          ...input,
          symbol,
        }
      })
      
      return {
        holdings: updated,
      }
    })
  },
  getHolding: (symbol) => {
    return get().holdings[symbol]
  },
}))


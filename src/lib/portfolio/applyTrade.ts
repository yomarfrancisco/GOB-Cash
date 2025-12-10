/**
 * Compute post-trade portfolio state from a trade
 * Single source of truth for deriving holdings after a trade
 */

import { calculateHealth } from './calculateMetrics'

export type HoldingsZAR = { CASH: number; ETH: number; ZWD: number }

export type Trade = {
  symbol: 'ETH' | 'BTC'
  deltaZAR: number // +buy / -sell in ZAR terms
}

export type PostTradeState = {
  next: HoldingsZAR
  total: number
  alloc: HoldingsZAR
}

export function computePostTrade(prev: HoldingsZAR, trade: Trade): PostTradeState {
  const next: HoldingsZAR = { ...prev }

  // Move cash opposite to target delta (ZWD is fiat, so it's not part of crypto trading)
  // For now, only ETH trading is supported
  if (trade.symbol === 'ETH') {
    next.CASH = Math.max(0, prev.CASH - trade.deltaZAR)
    next.ETH = Math.max(0, prev.ETH + trade.deltaZAR)
    // ZWD remains unchanged (it's fiat, not part of crypto trading)
  } else {
    // BTC trading not yet implemented - would need to add BTC to HoldingsZAR type
    // For now, treat BTC like ETH
    next.CASH = Math.max(0, prev.CASH - trade.deltaZAR)
    // Note: BTC is not in HoldingsZAR, so this would need to be extended
  }

  // Calculate total (guard against zero)
  const total = Math.max(1e-6, next.CASH + next.ETH + next.ZWD)

  // Calculate allocation percentages
  const alloc: HoldingsZAR = {
    CASH: (next.CASH / total) * 100,
    ETH: (next.ETH / total) * 100,
    ZWD: (next.ZWD / total) * 100,
  }

  return { next, total, alloc }
}

/**
 * Derive health for a symbol based on post-trade holdings
 */
export function deriveHealth(
  symbol: 'CASH' | 'ETH' | 'ZWD',
  holdings: HoldingsZAR,
  total: number
): number {
  const baseHealth: Record<'CASH' | 'ETH' | 'ZWD', number> = {
    CASH: 100,
    ETH: 60,
    ZWD: 100, // ZWD is fiat like ZAR/MZN
  }

  // Special handling for Cash: map allocation to [94%, 100%] range for subtle bar motion
  // 90% cash ≈ 94 health, 100% cash ≈ 100 health
  // This keeps the bar green and allows subtle wiggling without displaying numbers
  if (symbol === 'CASH') {
    const allocationPct = (holdings.CASH / total) * 100
    // Map from [90%, 100%] allocation to [94%, 100%] health
    // Linear interpolation: 90% -> 94%, 100% -> 100%
    const health = 94 + ((allocationPct - 90) / 10) * 6
    return Math.max(94, Math.min(100, Math.round(health * 10) / 10))
  }

  return calculateHealth(holdings[symbol], total, baseHealth[symbol])
}


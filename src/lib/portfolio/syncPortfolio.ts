/**
 * Sync portfolio store with wallet allocation
 * Called when wallet allocation changes to keep portfolio in sync
 */

import { usePortfolioStore } from '@/store/portfolio'
import { updatePortfolioHolding } from './calculateMetrics'

const FX_USD_ZAR_DEFAULT = 18.1

export function syncPortfolioFromAlloc(
  cashCents: number,
  ethCents: number,
  pepeCents: number,
  totalCents: number
) {
  const setHolding = usePortfolioStore.getState().setHolding
  const cashZAR = cashCents / 100
  const ethZAR = ethCents / 100
  const pepeZAR = pepeCents / 100
  const totalZAR = totalCents / 100

  // Update all holdings
  setHolding(updatePortfolioHolding('CASH', cashZAR, totalZAR, 100))
  setHolding(updatePortfolioHolding('ETH', ethZAR, totalZAR, 60))
  setHolding(updatePortfolioHolding('PEPE', pepeZAR, totalZAR, 25))
}


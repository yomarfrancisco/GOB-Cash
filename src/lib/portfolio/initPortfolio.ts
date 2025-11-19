/**
 * Initialize portfolio store from wallet allocation
 * Called on app mount to sync initial state
 */

import { usePortfolioStore } from '@/store/portfolio'
import { derivePortfolio } from './calculateMetrics'

const FX_USD_ZAR_DEFAULT = 18.1

export function initPortfolioFromAlloc(
  cashCents: number,
  ethCents: number,
  pepeCents: number,
  totalCents: number
) {
  const setHoldingsBulk = usePortfolioStore.getState().setHoldingsBulk
  const cashZAR = cashCents / 100
  const ethZAR = ethCents / 100
  const pepeZAR = pepeCents / 100
  const totalZAR = totalCents / 100

  // Calculate raw percentages
  const rawCashPct = (cashZAR / totalZAR) * 100
  const rawEthPct = (ethZAR / totalZAR) * 100
  const rawPepePct = (pepeZAR / totalZAR) * 100

  // Derive portfolio using single source of truth
  const portfolio = derivePortfolio({
    totalZAR,
    cashPct: rawCashPct,
    ethPct: rawEthPct,
    pepePct: rawPepePct,
    fx: FX_USD_ZAR_DEFAULT,
  })

  // Initialize all holdings atomically
  setHoldingsBulk({
    CASH: {
      symbol: 'CASH',
      amountZAR: portfolio.holdings.CASH.amountZAR,
      amountUSDT: portfolio.holdings.CASH.amountZAR / FX_USD_ZAR_DEFAULT,
      allocationPct: portfolio.holdings.CASH.allocationPct,
      displayPct: portfolio.displayPercents.cash,
      health: portfolio.holdings.CASH.health,
    },
    ETH: {
      symbol: 'ETH',
      amountZAR: portfolio.holdings.ETH.amountZAR,
      amountUSDT: portfolio.holdings.ETH.amountZAR / FX_USD_ZAR_DEFAULT,
      allocationPct: portfolio.holdings.ETH.allocationPct,
      displayPct: portfolio.displayPercents.eth,
      health: portfolio.holdings.ETH.health,
    },
    PEPE: {
      symbol: 'PEPE',
      amountZAR: portfolio.holdings.PEPE.amountZAR,
      amountUSDT: portfolio.holdings.PEPE.amountZAR / FX_USD_ZAR_DEFAULT,
      allocationPct: portfolio.holdings.PEPE.allocationPct,
      displayPct: portfolio.displayPercents.pepe,
      health: portfolio.holdings.PEPE.health,
    },
  })
}


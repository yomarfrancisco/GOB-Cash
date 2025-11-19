/**
 * Calculate portfolio metrics (allocation %, health) from amounts
 */

const FX_USD_ZAR_DEFAULT = 18.1

/**
 * Largest-remainder rounding: convert float percentages to integers that sum to 100
 */
function toDisplayPercents(pcts: number[]): number[] {
  const floors = pcts.map((p) => Math.floor(p))
  let remainder = 100 - floors.reduce((a, b) => a + b, 0)
  const fracs = pcts
    .map((p, i) => ({ i, frac: p - Math.floor(p) }))
    .sort((a, b) => b.frac - a.frac)
  const out = [...floors]
  for (let k = 0; k < remainder; k++) out[fracs[k].i] += 1
  return out
}

/**
 * Apportion ZAR amounts from percentages, fixing residual cents to ensure exact total
 * Pushes leftover cent(s) into CASH (index 0)
 */
function apportionZAR(total: number, pcts: number[]): number[] {
  const raw = pcts.map((p) => total * p / 100)
  const cents = raw.map((x) => Math.round(x * 100)) // integer cents
  const diff = Math.round(total * 100) - cents.reduce((a, b) => a + b, 0)
  // Push the leftover cent(s) into CASH
  const CASH_INDEX = 0 // assuming index 0 = CASH
  cents[CASH_INDEX] += diff
  return cents.map((c) => c / 100)
}

/**
 * Map Cash allocation percentage to health value [94-100]
 */
function cashHealthFromPct(cashPct: number): number {
  const clamped = Math.max(90, Math.min(100, cashPct))
  return 94 + (clamped - 90) * (6 / 10) // 90→94, 100→100
}

export type DerivePortfolioInput = {
  totalZAR: number
  cashPct: number // float 0-100
  ethPct: number // float 0-100
  pepePct: number // float 0-100
  fx?: number // FX rate (defaults to FX_USD_ZAR_DEFAULT)
}

export type DerivePortfolioOutput = {
  holdings: {
    CASH: { amountZAR: number; allocationPct: number; health: number }
    ETH: { amountZAR: number; allocationPct: number; health: number }
    PEPE: { amountZAR: number; allocationPct: number; health: number }
  }
  displayPercents: { cash: number; eth: number; pepe: number } // integers that sum to 100
}

/**
 * Single source of truth: derive portfolio holdings from allocation percentages
 * Enforces allocation rules, ensures exact totals, and returns display percentages
 */
export function derivePortfolio(input: DerivePortfolioInput): DerivePortfolioOutput {
  const { totalZAR, cashPct: rawCashPct, ethPct: rawEthPct, pepePct: rawPepePct, fx = FX_USD_ZAR_DEFAULT } = input

  // 1) Enforce allocation rules
  // Clamp to non-negatives
  let cashPct = Math.max(0, rawCashPct)
  let ethPct = Math.max(0, rawEthPct)
  let pepePct = Math.max(0, rawPepePct)

  // Normalize if they don't sum to 100
  const rawSum = cashPct + ethPct + pepePct
  if (rawSum > 0) {
    cashPct = (cashPct / rawSum) * 100
    ethPct = (ethPct / rawSum) * 100
    pepePct = (pepePct / rawSum) * 100
  } else {
    // Edge case: all zero, set to 100% cash
    cashPct = 100
    ethPct = 0
    pepePct = 0
  }

  // Enforce: Cash ≥ 90%, ETH + PEPE ≤ 10%
  const nonCashPct = ethPct + pepePct
  const targetNonCashPct = Math.min(10, nonCashPct)
  const targetCashPct = Math.max(90, 100 - targetNonCashPct)

  // Preserve ETH/PEPE ratio within the non-cash allocation
  if (nonCashPct > 0) {
    const ethRatio = ethPct / nonCashPct
    const pepeRatio = pepePct / nonCashPct
    ethPct = targetNonCashPct * ethRatio
    pepePct = targetNonCashPct * pepeRatio
  } else {
    // If both are zero, split evenly
    ethPct = targetNonCashPct * 0.5
    pepePct = targetNonCashPct * 0.5
  }
  cashPct = targetCashPct

  // 2) Apportion ZAR amounts (with residual-cent fix)
  const pcts = [cashPct, ethPct, pepePct]
  const amountsZAR = apportionZAR(totalZAR, pcts)
  const cashZAR = amountsZAR[0]
  const ethZAR = amountsZAR[1]
  const pepeZAR = amountsZAR[2]

  // 3) Calculate high-precision allocation percentages (for internal use)
  const cashAllocPct = (cashZAR / totalZAR) * 100
  const ethAllocPct = (ethZAR / totalZAR) * 100
  const pepeAllocPct = (pepeZAR / totalZAR) * 100

  // 4) Calculate display percentages (integers that sum to 100)
  const displayPcts = toDisplayPercents([cashAllocPct, ethAllocPct, pepeAllocPct])

  // 5) Calculate health for each holding
  const cashHealth = cashHealthFromPct(cashAllocPct)
  const ethHealth = calculateHealth(ethZAR, totalZAR, 60)
  const pepeHealth = calculateHealth(pepeZAR, totalZAR, 25)

  return {
    holdings: {
      CASH: {
        amountZAR: cashZAR,
        allocationPct: cashAllocPct,
        health: Math.round(cashHealth * 10) / 10,
      },
      ETH: {
        amountZAR: ethZAR,
        allocationPct: ethAllocPct,
        health: Math.round(ethHealth * 10) / 10,
      },
      PEPE: {
        amountZAR: pepeZAR,
        allocationPct: pepeAllocPct,
        health: Math.round(pepeHealth * 10) / 10,
      },
    },
    displayPercents: {
      cash: displayPcts[0],
      eth: displayPcts[1],
      pepe: displayPcts[2],
    },
  }
}

export function calculateAllocationPct(amountZAR: number, totalZAR: number): number {
  if (totalZAR === 0) return 0
  return Math.round((10000 * amountZAR) / totalZAR) / 100
}

export function calculateHealth(amountZAR: number, totalZAR: number, baseHealth: number): number {
  // Health is a function of allocation % relative to base
  // For now, use a simple linear mapping based on allocation
  const allocationPct = calculateAllocationPct(amountZAR, totalZAR)
  // Health decreases as allocation increases (more risk)
  // This is a simplified model - adjust as needed
  const healthFactor = Math.max(0, Math.min(100, baseHealth - (allocationPct - 10) * 2))
  return Math.round(healthFactor * 10) / 10
}

/**
 * Enforce allocation rules: Cash ≥ 90%, ETH + PEPE ≤ 10%
 * Returns ZAR amounts that sum exactly to totalZAR
 * This enforces share allocation percentages, not health
 */
export function enforceAllocations(
  inputZAR: { CASH: number; ETH: number; PEPE: number },
  totalZAR: number
): { CASH: number; ETH: number; PEPE: number } {
  // 1) Clamp raw to non-negatives
  let cashZAR = Math.max(0, inputZAR.CASH)
  let ethZAR = Math.max(0, inputZAR.ETH)
  let pepeZAR = Math.max(0, inputZAR.PEPE)

  // 2) Compute raw percentages
  const rawTotal = cashZAR + ethZAR + pepeZAR
  if (rawTotal === 0) {
    // Edge case: all zero, set to 100% cash
    return { CASH: totalZAR, ETH: 0, PEPE: 0 }
  }

  const rawEthPct = ethZAR / rawTotal
  const rawPepePct = pepeZAR / rawTotal
  const rawNonCashPct = rawEthPct + rawPepePct

  // 3) Scale ETH+PEPE together so (ETH+PEPE) = min(10%, raw ETH+PEPE) while preserving their ratio
  const targetNonCashPct = Math.min(0.10, rawNonCashPct)
  const targetCashPct = 1.0 - targetNonCashPct

  // 4) Set Cash = total - (ETH+PEPE)
  const remainingZAR = totalZAR * targetNonCashPct
  cashZAR = totalZAR * targetCashPct

  // 5) Preserve ETH/PEPE ratio within the non-cash allocation
  const nonCashTotal = ethZAR + pepeZAR
  if (nonCashTotal > 0) {
    ethZAR = (ethZAR / nonCashTotal) * remainingZAR
    pepeZAR = (pepeZAR / nonCashTotal) * remainingZAR
  } else {
    // If both are zero, split evenly
    ethZAR = remainingZAR * 0.5
    pepeZAR = remainingZAR * 0.5
  }

  // 6) Fix rounding drift on CASH to ensure exact total
  const actualTotal = cashZAR + ethZAR + pepeZAR
  const drift = totalZAR - actualTotal
  cashZAR += drift

  return {
    CASH: Math.max(0, cashZAR),
    ETH: Math.max(0, ethZAR),
    PEPE: Math.max(0, pepeZAR),
  }
}

export function updatePortfolioHolding(
  symbol: 'CASH' | 'ETH' | 'PEPE',
  amountZAR: number,
  totalZAR: number,
  baseHealth: number
) {
  return {
    symbol,
    amountZAR,
    amountUSDT: amountZAR / FX_USD_ZAR_DEFAULT,
    allocationPct: calculateAllocationPct(amountZAR, totalZAR),
    health: calculateHealth(amountZAR, totalZAR, baseHealth),
  }
}


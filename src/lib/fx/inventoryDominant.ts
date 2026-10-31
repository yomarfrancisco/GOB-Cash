import type { ConversionDestination } from '@/store/usePayIntoSheet'

/** Compare Moz inventory to ZAR inventory in ZAR terms. */
export function inventoryDominantCard(
  cashMzn: number,
  cashZar: number,
  mznPerZar: number
): 'mzn' | 'savings' {
  const mzn = Number(cashMzn) || 0
  const zar = Number(cashZar) || 0
  const mznAsZar = mznPerZar > 0 ? mzn / mznPerZar : 0
  return mznAsZar > zar ? 'mzn' : 'savings'
}

/** MZN-heavy → Buy ZAR (dest ZAR). ZAR-heavy → Sell ZAR (dest MZN). */
export function defaultConversionDestination(
  cashMzn: number,
  cashZar: number,
  mznPerZar: number
): ConversionDestination {
  return inventoryDominantCard(cashMzn, cashZar, mznPerZar) === 'mzn' ? 'ZAR' : 'MZN'
}

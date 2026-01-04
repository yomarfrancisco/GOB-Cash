/**
 * Apply platform fee to exchange rate
 * 
 * @param midRate - The mid-market rate (e.g., 3.88 for MZN)
 * @param feeBps - Platform fee in basis points (e.g., 50 = 0.5%, 0 = no fee)
 * @returns Adjusted rate with fee applied
 * 
 * @example
 * applyFeeToRate(3.88, 0) // Returns 3.88 (no fee)
 * applyFeeToRate(3.88, 50) // Returns 3.8994 (0.5% fee)
 */
export function applyFeeToRate(midRate: number, feeBps: number): number {
  if (feeBps === 0) {
    return midRate
  }

  const feeMultiplier = 1 + feeBps / 10000
  return midRate * feeMultiplier
}


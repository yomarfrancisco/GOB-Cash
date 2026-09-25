/**
 * A restock can close without "I've swiped" when bank receipts add up to the
 * tickets. Whole-rand rounding is allowed: about R1 per swipe.
 */

export function receiptsCoverRestock(expectedZar: number, amounts: number[]): boolean {
  if (!(expectedZar > 0) || amounts.length === 0) return false
  if (amounts.some((amount) => !(amount > 0))) return false
  const sum = Math.round(amounts.reduce((total, amount) => total + amount, 0) * 100) / 100
  const slack = Math.max(1, amounts.length)
  return Math.abs(sum - expectedZar) <= slack
}

/** Balance already in the wallet, or receipts since the restock was issued. */
export function mznCoversRestock(expectedMzn: number, balance: number, received: number[]): boolean {
  if (!(expectedMzn > 0)) return true
  if (balance + 0.5 >= expectedMzn) return true
  return receiptsCoverRestock(expectedMzn, received)
}

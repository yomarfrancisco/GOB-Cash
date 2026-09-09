/**
 * Currency formatting utilities
 * - Topline amounts: space grouping, dot decimals
 * - Card equivalence line: comma grouping, whole units
 */

export function formatMoneyFixed(n: number, decimals = 2): { groups: string; dot: string; cents: string } {
  const [i, f] = Math.abs(n).toFixed(decimals).split('.')
  const groups = i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return { groups, dot: '.', cents: f }
}

export function formatZAR(amount: number): { major: string; cents: string } {
  const { groups, cents } = formatMoneyFixed(amount, 2)
  return { major: groups, cents }
}

/** Card topline: hide cents once the amount is above 999.99, rounding to the nearest whole. */
export function formatCardTopline(amount: number): { major: string; cents?: string } {
  if (Math.abs(amount) > 999.99) {
    const rounded = Math.round(Math.abs(amount)).toFixed(0)
    const major = rounded.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
    return { major }
  }
  return formatZAR(amount)
}

export function formatUSDT(units: number): string {
  return formatEquivalenceAmount(units)
}

/** Small card equivalence line: rounded whole units with comma grouping. */
export function formatEquivalenceAmount(units: number): string {
  return Math.round(units).toLocaleString('en-US')
}


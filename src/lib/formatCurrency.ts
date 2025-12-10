/**
 * Currency formatting utilities
 * - Dot decimals (not comma)
 * - Thin spaces (U+2009) for thousands grouping
 * - No commas
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

export function formatUSDT(units: number): string {
  // No decimals for display unless we ever specify otherwise.
  // Round to nearest integer
  const rounded = Math.round(units)
  return rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}


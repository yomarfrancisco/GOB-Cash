export const formatZAR = (n: number) =>
  new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 2,
  }).format(n)

export function formatZARWithDot(amount: number): string {
  // two decimals, dot as separator, thin space as thousands (optional)
  const [whole, cents] = Math.abs(amount).toFixed(2).split('.')
  const wholeWithSep = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') // thin space
  const sign = amount < 0 ? '-' : ''
  return `${sign}R ${wholeWithSep}.${cents}`
}

export const formatMZN = (n: number) => formatMZNWithDot(n)

export function formatMZNWithDot(amount: number): string {
  const [whole, cents] = Math.abs(amount).toFixed(2).split('.')
  const wholeWithSep = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  const sign = amount < 0 ? '-' : ''
  return `${sign}Mt ${wholeWithSep}.${cents}`
}

export const formatUSDT = (n: number) => `USDT ${n.toFixed(2)}`

export function toMinorUnits(amount: number): number {
  return Math.round((Number(amount) || 0) * 100)
}

export function exceedsAvailableZar(amountZar: number, availableZar: number): boolean {
  return toMinorUnits(amountZar) > toMinorUnits(availableZar)
}

export function exceedsAvailableMzn(amountMzn: number, availableMzn: number): boolean {
  return toMinorUnits(amountMzn) > toMinorUnits(availableMzn)
}


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

export const formatUSDT = (n: number) => `USDT ${n.toFixed(2)}`


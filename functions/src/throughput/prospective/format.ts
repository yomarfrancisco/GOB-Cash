export function formatExactZar(value: number): string {
  const sign = value < 0 ? '-' : ''
  const [whole, frac] = Math.abs(value).toFixed(2).split('.')
  const grouped = (whole ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${sign}R${grouped}.${frac}`
}

export function moneyZar(value: number): number {
  return Math.round(value * 100) / 100
}

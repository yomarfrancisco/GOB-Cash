/**
 * Desk mock-card money formats — match Home card toplines.
 * Major (cards + headlines): "Mt 8 472 707" / "R 100 000" (space groups; whole units above 999.99).
 * Minor (one-liners, sub-lines, rows, totals): "8,918,639.00 MZN" / "R100,000.00" (en-US, 2 dp).
 */

import { formatCardTopline, formatEquivalenceAmount } from '@/lib/formatCurrency'

function enUsFixed(amount: number): string {
  const n = Number(amount) || 0
  return Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** Home-card major for meticais. */
export function formatDeskMajorMzn(amount: number): string {
  const n = Number(amount) || 0
  const { major, cents } = formatCardTopline(n)
  const sign = n < 0 ? '-' : ''
  return cents != null ? `${sign}Mt ${major}.${cents}` : `${sign}Mt ${major}`
}

/** Home-card major for rand. */
export function formatDeskMajorZar(amount: number): string {
  const n = Number(amount) || 0
  const { major, cents } = formatCardTopline(n)
  const sign = n < 0 ? '-' : ''
  return cents != null ? `${sign}R ${major}.${cents}` : `${sign}R ${major}`
}

/** Smaller desk line for meticais: en-US decimals + MZN suffix. */
export function formatDeskMinorMzn(amount: number): string {
  const n = Number(amount) || 0
  const sign = n < 0 ? '-' : ''
  return `${sign}${enUsFixed(n)} MZN`
}

/** Smaller desk line for rand: R prefix + en-US decimals (no space). */
export function formatDeskMinorZar(amount: number): string {
  const n = Number(amount) || 0
  const sign = n < 0 ? '-' : ''
  return `${sign}R${enUsFixed(n)}`
}

/** Minor equivalence line on mock cards (comma grouping). */
export function formatDeskMinorUsd(amount: number): string {
  return `${formatEquivalenceAmount(Math.abs(Number(amount) || 0))} USD`
}

/** Compact rate chip matching home (e.g. 4.46 Mt/R). */
export function formatDeskRateMtPerZar(rate: number): string {
  const r = Number(rate) || 0
  return `${r.toFixed(2)} Mt/R`
}

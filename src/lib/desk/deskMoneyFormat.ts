/**
 * Desk mock-card money formats — match Home card toplines.
 * Major: "Mt 1 550 807" / "R 810.92" (space groups; hide cents above 999.99).
 * Minor: "12,345 USD" (comma groups, whole units).
 */

import { formatCardTopline, formatEquivalenceAmount } from '@/lib/formatCurrency'

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

/** Minor equivalence line on mock cards (comma grouping). */
export function formatDeskMinorUsd(amount: number): string {
  return `${formatEquivalenceAmount(Math.abs(Number(amount) || 0))} USD`
}

/** Compact rate chip matching home (e.g. 4.46 Mt/R). */
export function formatDeskRateMtPerZar(rate: number): string {
  const r = Number(rate) || 0
  return `${r.toFixed(2)} Mt/R`
}

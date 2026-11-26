/**
 * Desk mock-card money formats — match Home card toplines.
 * Major (cards + headlines): "Mt 8 472 707" / "R 100 000"
 * Minor (one-liners, sub-lines, rows): "8,918,639.00 MZN" / "R100,000.00"
 */

import { formatCardTopline, formatEquivalenceAmount } from '@/lib/formatCurrency'

function enUsFixed(amount: number): string {
  const n = Number(amount) || 0
  return Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * Parse desk money tokens from ledger/pipe copy.
 * Handles en-ZA (`R100 000,00`) and en-US (`R100,000.00` / `436,660.13 MZN`).
 * Do not strip all non-digits — that turns `R100 000,00` into 10_000_000.
 */
export function parseDeskMoneyToken(raw: string | undefined | null): number | null {
  if (raw == null) return null
  const cleaned = String(raw)
    .replace(/^(?:R|Mt|\$)\s*/i, '')
    .replace(/\s*(?:MZN|ZAR|USD)\b.*$/i, '')
    .trim()
  if (!cleaned) return null
  const compact = cleaned.replace(/\s/g, '')
  const commaDecimal = /,\d{1,2}$/.test(compact) && !/\.\d{1,2}$/.test(compact)
  const normalized = commaDecimal
    ? compact.replace(/\./g, '').replace(',', '.')
    : compact.replace(/,/g, '')
  const value = Number(normalized.replace(/[^\d.-]/g, ''))
  return Number.isFinite(value) ? value : null
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

/** Home/desk major for dollars: "$5 000" (no cents ≥ 1000) or "$0.00". */
export function formatDeskMajorUsd(amount: number): string {
  const n = Number(amount) || 0
  const sign = n < 0 ? '-' : ''
  const { major, cents } = formatCardTopline(Math.abs(n))
  return cents != null ? `${sign}$${major}.${cents}` : `${sign}$${major}`
}

/** Compact USD for titles with comma grouping when ≥ 1000: "$5,000". */
export function formatDeskTitleUsd(amount: number): string {
  const n = Number(amount) || 0
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  if (abs > 999.99) {
    return `${sign}$${Math.round(abs).toLocaleString('en-US')}`
  }
  return `${sign}$${abs.toFixed(2)}`
}

/** Minor earn line: "≈ 5,000 USD earned" */
export function formatDeskUsdcSuppliedMinor(amount: number): string {
  const n = Math.max(0, Number(amount) || 0)
  return `≈ ${Math.round(n).toLocaleString('en-US')} USD earned`
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

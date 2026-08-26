/**
 * Quoted MZN per ZAR = ExchangeRate-API mid-market × corridor markup.
 * Receive ZAR (MZN→ZAR): 15%. Receive MZN (ZAR→MZN): 5%.
 */

import * as functions from 'firebase-functions'

export const MZN_ZAR_MARKUP = 1.15
export const MZN_ZAR_MARKUP_RECEIVE_MZN = 1.05
export const MZN_ZAR_API_RATE_AT_CALIBRATION = 3.98793
export const MZN_PER_ZAR_FALLBACK = MZN_ZAR_API_RATE_AT_CALIBRATION * MZN_ZAR_MARKUP

const CACHE_MS = 2 * 60 * 1000

let cached: { apiRate: number; at: number } | null = null

function fxLatestZarUrl(): string {
  const key = process.env.EXCHANGE_RATE_API_KEY || functions.config()?.exchangerate?.key
  if (typeof key === 'string' && key.length > 0) {
    return `https://v6.exchangerate-api.com/v6/${key}/latest/ZAR`
  }
  return 'https://open.er-api.com/v6/latest/ZAR'
}

function mznFromPayload(data: {
  conversion_rates?: Record<string, number>
  rates?: Record<string, number>
}): number {
  const rates = data.conversion_rates || data.rates
  return Number(rates?.MZN)
}

export function quoteMznPerZar(apiMznPerZar: number, markup = MZN_ZAR_MARKUP): number {
  if (!Number.isFinite(apiMznPerZar) || apiMznPerZar <= 0) {
    return MZN_ZAR_API_RATE_AT_CALIBRATION * markup
  }
  return apiMznPerZar * markup
}

export async function fetchQuotedMznPerZar(markup = MZN_ZAR_MARKUP): Promise<number> {
  const now = Date.now()
  if (cached && now - cached.at < CACHE_MS) {
    return quoteMznPerZar(cached.apiRate, markup)
  }

  try {
    const response = await fetch(fxLatestZarUrl())
    if (!response.ok) throw new Error(`FX HTTP ${response.status}`)
    const data = await response.json()
    const apiRate = mznFromPayload(data)
    if (data?.result !== 'success' || !Number.isFinite(apiRate) || apiRate <= 0) {
      throw new Error('FX payload missing MZN')
    }
    cached = { apiRate, at: now }
    return quoteMznPerZar(apiRate, markup)
  } catch (error) {
    console.warn('[FX] Falling back to corridor rate', error)
    if (cached) return quoteMznPerZar(cached.apiRate, markup)
    return MZN_ZAR_API_RATE_AT_CALIBRATION * markup
  }
}

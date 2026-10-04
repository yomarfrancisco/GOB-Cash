/**
 * Quoted MZN per ZAR = ExchangeRate-API mid × corridor markup.
 *
 * SELL (all cards): mid × 1.05 × 1.10
 * COST by Moz issuing bank (restock source):
 *   BCI            → mid × 1.05
 *   FNB / Standard → mid × 1.06
 *   Millennium BIM → mid × 1.07
 *
 * Base COST (BCI) is the reference; higher bank COST shrinks that card's spread.
 */

import * as functions from 'firebase-functions'

export const MZN_ZAR_MARKUP_RECEIVE_MZN = 1.05
export const COST_MARKUP_BCI = 1.05
export const COST_MARKUP_FNB_STD = 1.06
export const COST_MARKUP_BIM = 1.07
export const MARGIN_ON_COST = 0.10
export const MZN_ZAR_MARKUP = MZN_ZAR_MARKUP_RECEIVE_MZN * (1 + MARGIN_ON_COST)
export const MZN_ZAR_API_RATE_AT_CALIBRATION = 3.98793
export const MZN_PER_ZAR_FALLBACK = MZN_ZAR_API_RATE_AT_CALIBRATION * MZN_ZAR_MARKUP

/** Map desk `mozBankId` → COST markup on API mid. */
export function costMarkupFromMozBankId(mozBankId: string | null | undefined): number {
  switch (String(mozBankId || '').toLowerCase()) {
    case 'bim':
      return COST_MARKUP_BIM
    case 'fnb':
    case 'standard':
      return COST_MARKUP_FNB_STD
    case 'bci':
    default:
      return COST_MARKUP_BCI
  }
}

/** Map Moz issuing-bank label → COST markup on API mid. */
export function costMarkupFromIssuingBank(issuingBank: string | null | undefined): number {
  const text = String(issuingBank || '')
  if (/BIM|Millennium/i.test(text)) return COST_MARKUP_BIM
  if (/Standard/i.test(text)) return COST_MARKUP_FNB_STD
  if (/FNB/i.test(text)) return COST_MARKUP_FNB_STD
  if (/BCI/i.test(text)) return COST_MARKUP_BCI
  return COST_MARKUP_BCI
}

/**
 * Scale a base (BCI / mid×1.05) COST quote to another bank's markup.
 * `baseCostRate` must be mid × COST_MARKUP_BCI.
 */
export function costRateForBankMarkup(baseCostRate: number, bankMarkup: number): number {
  if (!(baseCostRate > 0) || !(bankMarkup > 0)) return 0
  return baseCostRate * (bankMarkup / MZN_ZAR_MARKUP_RECEIVE_MZN)
}

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

export function mznRewardsFromZar(amountZar: number, sellRate: number, buyRate: number): number {
  if (!Number.isFinite(amountZar) || amountZar <= 0) return 0
  return Math.round(amountZar * Math.max(0, sellRate - buyRate) * 100) / 100
}

/** COST is SELL discounted by the live margin-on-cost. */
export function costMznPerZarFromSell(sellRate: number): number {
  if (!Number.isFinite(sellRate) || sellRate <= 0) {
    return MZN_ZAR_API_RATE_AT_CALIBRATION * MZN_ZAR_MARKUP_RECEIVE_MZN
  }
  return sellRate / (1 + MARGIN_ON_COST)
}

/** Rewards-card spread as a fraction of cost: (sell − cost) / cost. */
export function liveGrossSpreadRate(sellRate: number, costRate = costMznPerZarFromSell(sellRate)): number {
  if (!Number.isFinite(sellRate) || !Number.isFinite(costRate) || costRate <= 0) {
    return MARGIN_ON_COST
  }
  return Math.max(0, (sellRate - costRate) / costRate)
}

export async function fetchQuotedMznPerZar(markup = MZN_ZAR_MARKUP): Promise<number> {
  const now = Date.now()
  if (cached && now - cached.at < CACHE_MS) {
    return quoteMznPerZar(cached.apiRate, markup)
  }

  try {
    const response = await fetch(fxLatestZarUrl(), { signal: AbortSignal.timeout(8000) })
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

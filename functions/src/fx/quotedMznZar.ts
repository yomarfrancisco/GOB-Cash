/**
 * Quoted MZN per ZAR = ExchangeRate-API free mid-market × corridor markup.
 * Receive ZAR (MZN→ZAR): 15%. Receive MZN (ZAR→MZN): 5%.
 */

export const MZN_ZAR_MARKUP = 1.15
export const MZN_ZAR_MARKUP_RECEIVE_MZN = 1.05
export const MZN_ZAR_API_RATE_AT_CALIBRATION = 3.98793
export const MZN_PER_ZAR_FALLBACK = MZN_ZAR_API_RATE_AT_CALIBRATION * MZN_ZAR_MARKUP

const EXCHANGE_RATE_API = 'https://open.er-api.com/v6/latest/ZAR'
const CACHE_MS = 2 * 60 * 1000

let cached: { apiRate: number; at: number } | null = null

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
    const response = await fetch(EXCHANGE_RATE_API)
    if (!response.ok) throw new Error(`FX HTTP ${response.status}`)
    const data = await response.json()
    const apiRate = Number(data?.rates?.MZN)
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

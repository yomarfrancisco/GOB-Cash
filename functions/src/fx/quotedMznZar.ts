/**
 * Quoted MZN per ZAR = ExchangeRate-API free mid-market × 15% corridor markup.
 */

export const MZN_ZAR_MARKUP = 1.15
export const MZN_ZAR_API_RATE_AT_CALIBRATION = 3.98793
export const MZN_PER_ZAR_FALLBACK = MZN_ZAR_API_RATE_AT_CALIBRATION * MZN_ZAR_MARKUP

const EXCHANGE_RATE_API = 'https://open.er-api.com/v6/latest/ZAR'
const CACHE_MS = 2 * 60 * 1000

let cached: { rate: number; at: number } | null = null

export function quoteMznPerZar(apiMznPerZar: number): number {
  if (!Number.isFinite(apiMznPerZar) || apiMznPerZar <= 0) return MZN_PER_ZAR_FALLBACK
  return apiMznPerZar * MZN_ZAR_MARKUP
}

export async function fetchQuotedMznPerZar(): Promise<number> {
  const now = Date.now()
  if (cached && now - cached.at < CACHE_MS) return cached.rate

  try {
    const response = await fetch(EXCHANGE_RATE_API)
    if (!response.ok) throw new Error(`FX HTTP ${response.status}`)
    const data = await response.json()
    const apiRate = Number(data?.rates?.MZN)
    if (data?.result !== 'success' || !Number.isFinite(apiRate) || apiRate <= 0) {
      throw new Error('FX payload missing MZN')
    }
    const quoted = quoteMznPerZar(apiRate)
    cached = { rate: quoted, at: now }
    return quoted
  } catch (error) {
    console.warn('[FX] Falling back to corridor rate', error)
    return cached?.rate ?? MZN_PER_ZAR_FALLBACK
  }
}

// Quoted MZN per ZAR = ExchangeRate-API free mid-market × 15% corridor markup.
export const MZN_ZAR_MARKUP = 1.15
export const MZN_ZAR_API_RATE_AT_CALIBRATION = 3.98793
export const MZN_PER_ZAR = MZN_ZAR_API_RATE_AT_CALIBRATION * MZN_ZAR_MARKUP
export const ZAR_PER_USDT = 18.1

export function quoteMznPerZar(apiMznPerZar: number): number {
  if (!Number.isFinite(apiMznPerZar) || apiMznPerZar <= 0) return MZN_PER_ZAR
  return apiMznPerZar * MZN_ZAR_MARKUP
}

export const mznToZar = (amountMZN: number, rateMZNperZAR = MZN_PER_ZAR) =>
  Math.round((amountMZN / rateMZNperZAR) * 100) / 100

export const zarToMzn = (amountZAR: number, rateMZNperZAR = MZN_PER_ZAR) =>
  amountZAR * rateMZNperZAR

export const zarToUsdt = (amountZAR: number) => amountZAR / ZAR_PER_USDT

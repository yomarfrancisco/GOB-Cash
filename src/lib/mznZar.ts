// Calibrated 26 Aug 2026 against ExchangeRate-API's free ZAR feed.
// Mid-market: 1 ZAR = 3.98793 MZN. Corridor market: 4.6 MZN per ZAR.
// Markup = 4.6 / 3.98793 − 1 = 15.348%.
export const MZN_ZAR_API_RATE_AT_CALIBRATION = 3.98793
export const MZN_ZAR_CORRIDOR_AT_CALIBRATION = 4.6
export const MZN_ZAR_MARKUP = MZN_ZAR_CORRIDOR_AT_CALIBRATION / MZN_ZAR_API_RATE_AT_CALIBRATION
export const MZN_PER_ZAR = MZN_ZAR_CORRIDOR_AT_CALIBRATION
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

// Quoted MZN per ZAR = ExchangeRate-API free mid-market × corridor markup.
// Receive ZAR (MZN→ZAR): 15%. Receive MZN (ZAR→MZN): 5%.
export const MZN_ZAR_MARKUP = 1.15
export const MZN_ZAR_MARKUP_RECEIVE_MZN = 1.05
export const MZN_ZAR_API_RATE_AT_CALIBRATION = 3.98793
export const MZN_PER_ZAR = MZN_ZAR_API_RATE_AT_CALIBRATION * MZN_ZAR_MARKUP
export const ZAR_PER_USDT = 18.1

export function quoteMznPerZar(apiMznPerZar: number, markup = MZN_ZAR_MARKUP): number {
  if (!Number.isFinite(apiMznPerZar) || apiMznPerZar <= 0) {
    return MZN_ZAR_API_RATE_AT_CALIBRATION * markup
  }
  return apiMznPerZar * markup
}

/** `quotedReceiveZar` is the 15% marked-up MZN rate from `/api/fx/latest`. */
export function quotedMznPerZarForDestination(
  quotedReceiveZar: number,
  destination: 'ZAR' | 'MZN'
): number {
  const receiveZar =
    Number.isFinite(quotedReceiveZar) && quotedReceiveZar > 0
      ? quotedReceiveZar
      : MZN_PER_ZAR
  if (destination !== 'MZN') return receiveZar
  return (receiveZar / MZN_ZAR_MARKUP) * MZN_ZAR_MARKUP_RECEIVE_MZN
}

export const mznToZar = (amountMZN: number, rateMZNperZAR = MZN_PER_ZAR) =>
  Math.round((amountMZN / rateMZNperZAR) * 100) / 100

export const zarToMzn = (amountZAR: number, rateMZNperZAR = MZN_PER_ZAR) =>
  amountZAR * rateMZNperZAR

export const zarToUsdt = (amountZAR: number) => amountZAR / ZAR_PER_USDT

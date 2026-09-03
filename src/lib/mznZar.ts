// Quoted MZN per ZAR = ExchangeRate-API mid × corridor markup.
// COST is 5% above mid. SELL is a 10% spread on that cost (change MARGIN_ON_COST to retune).
export const MZN_ZAR_MARKUP_RECEIVE_MZN = 1.05
export const MARGIN_ON_COST = 0.10
export const MZN_ZAR_MARKUP = MZN_ZAR_MARKUP_RECEIVE_MZN * (1 + MARGIN_ON_COST)
export const MZN_ZAR_API_RATE_AT_CALIBRATION = 3.98793
export const MZN_PER_ZAR = MZN_ZAR_API_RATE_AT_CALIBRATION * MZN_ZAR_MARKUP
export const ZAR_PER_USDT = 18.1

export function quoteMznPerZar(apiMznPerZar: number, markup = MZN_ZAR_MARKUP): number {
  if (!Number.isFinite(apiMznPerZar) || apiMznPerZar <= 0) {
    return MZN_ZAR_API_RATE_AT_CALIBRATION * markup
  }
  return apiMznPerZar * markup
}

/** `quotedReceiveZar` is the SELL rate from `/api/fx/latest` (cost × (1 + MARGIN_ON_COST)). */
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

export function sellMznPerZar(quotedReceiveZar: number): number {
  return quotedMznPerZarForDestination(quotedReceiveZar, 'ZAR')
}

export function costMznPerZar(quotedReceiveZar: number): number {
  return quotedMznPerZarForDestination(quotedReceiveZar, 'MZN')
}

export const mznToZar = (amountMZN: number, rateMZNperZAR = MZN_PER_ZAR) =>
  Math.round((amountMZN / rateMZNperZAR) * 100) / 100

export const zarToMzn = (amountZAR: number, rateMZNperZAR = MZN_PER_ZAR) =>
  amountZAR * rateMZNperZAR

export const zarToUsdt = (amountZAR: number) => amountZAR / ZAR_PER_USDT

/** Sell Mt/R minus cost Mt/R. */
export function mznBuySellSpreadPerZar(quotedReceiveZar: number): number {
  return Math.max(0, sellMznPerZar(quotedReceiveZar) - costMznPerZar(quotedReceiveZar))
}

/** Rewards in MZN when selling rands into metical. */
export function mznRewardsFromZar(amountZAR: number, quotedReceiveZar: number): number {
  if (!Number.isFinite(amountZAR) || amountZAR <= 0) return 0
  return Math.round(amountZAR * mznBuySellSpreadPerZar(quotedReceiveZar) * 100) / 100
}

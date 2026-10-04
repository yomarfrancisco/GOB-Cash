// Quoted MZN per ZAR = ExchangeRate-API mid × corridor markup.
// SELL (all cards): mid × 1.05 × 1.10
// COST by Moz issuing bank: BCI mid×1.05, FNB/Std mid×1.06, BIM mid×1.07
export const MZN_ZAR_MARKUP_RECEIVE_MZN = 1.05
export const COST_MARKUP_BCI = 1.05
export const COST_MARKUP_FNB_STD = 1.06
export const COST_MARKUP_BIM = 1.07
export const MARGIN_ON_COST = 0.10
export const MZN_ZAR_MARKUP = MZN_ZAR_MARKUP_RECEIVE_MZN * (1 + MARGIN_ON_COST)
export const MZN_ZAR_API_RATE_AT_CALIBRATION = 3.98793
export const MZN_PER_ZAR = MZN_ZAR_API_RATE_AT_CALIBRATION * MZN_ZAR_MARKUP
export const ZAR_PER_USDT = 18.1

/** Desk swipe bank labels → COST markup on API mid. */
export function costMarkupFromBankShort(bankShort: string | null | undefined): number {
  const text = String(bankShort || '')
  if (/BIM|Millennium/i.test(text)) return COST_MARKUP_BIM
  if (/Std Bank|Standard/i.test(text)) return COST_MARKUP_FNB_STD
  if (/FNB/i.test(text)) return COST_MARKUP_FNB_STD
  if (/BCI/i.test(text)) return COST_MARKUP_BCI
  return COST_MARKUP_BCI
}

/** `/api/fx/latest` MZN is the SELL quote; recover mid then apply bank COST markup. */
export function costMznPerZarForBank(
  sellQuoteMznPerZar: number,
  bankShort: string | null | undefined
): number {
  const sell =
    Number.isFinite(sellQuoteMznPerZar) && sellQuoteMznPerZar > 0
      ? sellQuoteMznPerZar
      : MZN_PER_ZAR
  const mid = sell / MZN_ZAR_MARKUP
  return mid * costMarkupFromBankShort(bankShort)
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

/** Live ZAR-weighted bank COST economics for a Step 4 ticket set. */
export function weightedBankCostFromSplits(
  splits: Array<{ amountZar: number; bankShort?: string | null }>,
  sellQuoteMznPerZar: number
): {
  amountZar: number
  sellMzn: number
  restockMzn: number
  weightedCost: number
  spreadPerZar: number
  grossProfitMzn: number
  sellRate: number
} | null {
  const sell =
    Number.isFinite(sellQuoteMznPerZar) && sellQuoteMznPerZar > 0
      ? sellQuoteMznPerZar
      : 0
  if (!(sell > 0) || !splits.length) return null
  let amountZar = 0
  let restockMzn = 0
  for (const row of splits) {
    const zar = Number(row.amountZar)
    if (!(zar > 0)) continue
    amountZar += zar
    restockMzn += zar * costMznPerZarForBank(sell, row.bankShort)
  }
  amountZar = roundMoney(amountZar)
  restockMzn = roundMoney(restockMzn)
  if (!(amountZar > 0)) return null
  const sellMzn = roundMoney(amountZar * sell)
  const weightedCost = roundMoney(restockMzn / amountZar)
  return {
    amountZar,
    sellMzn,
    restockMzn,
    weightedCost,
    spreadPerZar: roundMoney(Math.max(0, sell - weightedCost)),
    grossProfitMzn: roundMoney(Math.max(0, sellMzn - restockMzn)),
    sellRate: sell,
  }
}

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

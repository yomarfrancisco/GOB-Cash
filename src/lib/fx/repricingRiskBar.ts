export const ZAR_PAYOUT_RISK_CURRENCY = 'ZAR'

export type RepricingBarInput = {
  dataStatus?: string | null
  riskScore?: number | null
} | null

export function clampRiskScore(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

export function isZarPayoutRiskCard(currencyCode: string | null | undefined): boolean {
  return currencyCode === ZAR_PAYOUT_RISK_CURRENCY
}

/** Only the ZAR card binds to payout risk. Stack position is ignored. */
export function riskBarPercentForCard(
  currencyCode: string | null | undefined,
  input: RepricingBarInput,
  _stackIndex?: number
): number | null {
  if (!isZarPayoutRiskCard(currencyCode)) return null
  return repricingRiskBarPercent(input)
}

export function cardDisplaysBottomBar(params: {
  currencyCode: string
  cardType: string
}): boolean {
  if (params.cardType === 'yieldSurprise') return false
  if (params.currencyCode === 'MZN' && params.cardType === 'mzn') return false
  if (isZarPayoutRiskCard(params.currencyCode)) return true
  return params.cardType !== 'savings'
}

/** Visual bar 0–100. Learning, stale, or unavailable stay at the minimum/neutral state. */
export function repricingRiskBarPercent(input: RepricingBarInput): number {
  if (!input || input.dataStatus !== 'ready') return 0
  return clampRiskScore(Number(input.riskScore))
}

export function repricingRiskAriaLevel(
  input: RepricingBarInput
): 'low' | 'moderate' | 'high' | 'unavailable' {
  if (!input || input.dataStatus !== 'ready') return 'unavailable'
  const score = clampRiskScore(Number(input.riskScore))
  if (score < 25) return 'low'
  if (score < 50) return 'moderate'
  return 'high'
}

/** Daily targets from PAGA Operating Calendar Rulebook v1.0 §§8–10. */

import { OPERATING_POLICY_V1 } from './operatingPolicyV1'

export type DayTarget = { date: string; targetZar: number; paymentCount: number }

/**
 * Prefer fewer whole-invoice events under the R15,000 ceiling.
 * Early operating days keep denser books so Econometrica / new-card stage A/B
 * (R5,000 then R6,500) can clear before the established ceiling applies.
 */
export function paymentCountForTarget(targetZar: number, operatingDayIndex0: number, month: 1 | 2): number {
  const maxP = OPERATING_POLICY_V1.payment.maxAmountZar
  const minNeeded = Math.max(1, Math.ceil(targetZar / maxP))
  const rampDays = month === 1 ? 7 : 10
  if (operatingDayIndex0 < rampDays) {
    return Math.min(5, Math.max(5, minNeeded))
  }
  return Math.min(5, Math.max(3, minNeeded))
}

function withPaymentCounts(
  days: Array<{ date: string; targetZar: number }>,
  month: 1 | 2
): DayTarget[] {
  return days.map((d, i) => ({
    ...d,
    paymentCount: paymentCountForTarget(d.targetZar, i, month),
  }))
}

const MONTH1_DAY_TARGETS = [
  { date: '2026-10-01', targetZar: 20_400 },
  { date: '2026-10-02', targetZar: 19_700 },
  { date: '2026-10-03', targetZar: 22_200 },
  { date: '2026-10-05', targetZar: 24_600 },
  { date: '2026-10-06', targetZar: 25_300 },
  { date: '2026-10-07', targetZar: 23_900 },
  { date: '2026-10-08', targetZar: 26_700 },
  { date: '2026-10-09', targetZar: 24_800 },
  { date: '2026-10-10', targetZar: 25_900 },
  { date: '2026-10-12', targetZar: 23_100 },
  { date: '2026-10-13', targetZar: 26_400 },
  { date: '2026-10-14', targetZar: 24_600 },
  { date: '2026-10-15', targetZar: 25_200 },
  { date: '2026-10-16', targetZar: 25_500 },
  { date: '2026-10-17', targetZar: 23_800 },
  { date: '2026-10-19', targetZar: 25_700 },
  { date: '2026-10-20', targetZar: 24_100 },
  { date: '2026-10-21', targetZar: 25_900 },
  { date: '2026-10-22', targetZar: 24_700 },
  { date: '2026-10-23', targetZar: 25_800 },
  { date: '2026-10-24', targetZar: 23_600 },
  { date: '2026-10-26', targetZar: 26_100 },
  { date: '2026-10-27', targetZar: 24_900 },
  { date: '2026-10-28', targetZar: 25_200 },
  { date: '2026-10-29', targetZar: 23_300 },
  { date: '2026-10-30', targetZar: 25_800 },
  { date: '2026-10-31', targetZar: 22_800 },
]

const MONTH2_DAY_TARGETS = [
  { date: '2026-11-02', targetZar: 28_340 },
  { date: '2026-11-03', targetZar: 29_340 },
  { date: '2026-11-04', targetZar: 29_640 },
  { date: '2026-11-05', targetZar: 28_640 },
  { date: '2026-11-06', targetZar: 29_840 },
  { date: '2026-11-07', targetZar: 28_840 },
  { date: '2026-11-09', targetZar: 29_440 },
  { date: '2026-11-10', targetZar: 28_540 },
  { date: '2026-11-11', targetZar: 29_740 },
  { date: '2026-11-12', targetZar: 28_740 },
  { date: '2026-11-13', targetZar: 29_540 },
  { date: '2026-11-14', targetZar: 28_440 },
  { date: '2026-11-16', targetZar: 29_240 },
  { date: '2026-11-17', targetZar: 28_240 },
  { date: '2026-11-18', targetZar: 29_940 },
  { date: '2026-11-19', targetZar: 28_940 },
  { date: '2026-11-20', targetZar: 29_390 },
  { date: '2026-11-21', targetZar: 28_590 },
  { date: '2026-11-23', targetZar: 29_690 },
  { date: '2026-11-24', targetZar: 28_790 },
  { date: '2026-11-25', targetZar: 29_790 },
  { date: '2026-11-26', targetZar: 28_490 },
  { date: '2026-11-27', targetZar: 29_140 },
  { date: '2026-11-28', targetZar: 28_140 },
  { date: '2026-11-30', targetZar: 28_540 },
]

const MONTH1_DAYS = withPaymentCounts(MONTH1_DAY_TARGETS, 1)
const MONTH2_DAYS = withPaymentCounts(MONTH2_DAY_TARGETS, 2)

export const MONTH1_OCTOBER_2026: {
  month: string
  networkState: 'cold_start'
  operatingDays: number
  payments: number
  plannedValueZar: number
  arithmeticCeilingZar: number
  referenceLedgerSha256: string
  days: DayTarget[]
} = {
  month: '2026-10',
  networkState: 'cold_start',
  operatingDays: 27,
  payments: MONTH1_DAYS.reduce((s, d) => s + d.paymentCount, 0),
  plannedValueZar: 660_000,
  arithmeticCeilingZar: 795_000,
  referenceLedgerSha256: '0d7c1e06653a013491305f320353cb35d53c9c69db2efbfca8320189b5914102',
  days: MONTH1_DAYS,
}

export const MONTH2_NOVEMBER_2026: {
  month: string
  networkState: 'established'
  operatingDays: number
  payments: number
  plannedValueZar: number
  arithmeticCeilingZar: number
  authorisedGrowthRate: number
  newCardId: 'NEW_CARD_M2'
  days: DayTarget[]
} = {
  month: '2026-11',
  networkState: 'established',
  operatingDays: 25,
  payments: MONTH2_DAYS.reduce((s, d) => s + d.paymentCount, 0),
  plannedValueZar: 726_000,
  arithmeticCeilingZar: 750_000,
  authorisedGrowthRate: 0.1,
  newCardId: 'NEW_CARD_M2',
  days: MONTH2_DAYS,
}

export const TWO_PAYMENT_PATTERNS = [
  [0.52, 0.48],
  [0.55, 0.45],
  [0.51, 0.49],
] as const

export const THREE_PAYMENT_PATTERNS = [
  [0.4, 0.35, 0.25],
  [0.38, 0.34, 0.28],
  [0.42, 0.33, 0.25],
] as const

export const FOUR_PAYMENT_PATTERNS = [
  [0.31, 0.27, 0.23, 0.19],
  [0.29, 0.26, 0.24, 0.21],
  [0.33, 0.25, 0.23, 0.19],
] as const

export const FIVE_PAYMENT_PATTERNS_M1 = [
  [0.25, 0.22, 0.2, 0.18, 0.15],
  [0.27, 0.23, 0.19, 0.17, 0.14],
  [0.24, 0.21, 0.2, 0.19, 0.16],
  [0.26, 0.21, 0.19, 0.18, 0.16],
  [0.23, 0.22, 0.21, 0.19, 0.15],
] as const

export const FIVE_PAYMENT_PATTERNS_M2 = [
  [0.25, 0.22, 0.2, 0.18, 0.15],
  [0.26, 0.23, 0.19, 0.17, 0.15],
  [0.24, 0.22, 0.2, 0.19, 0.15],
  [0.25, 0.21, 0.2, 0.18, 0.16],
  [0.23, 0.22, 0.21, 0.19, 0.15],
] as const

export const BASE_TIMES = {
  two_odd: [9 * 60 + 20, 13 * 60 + 40],
  two_even: [9 * 60 + 50, 14 * 60 + 10],
  three_odd: [9 * 60 + 16, 12 * 60 + 5, 15 * 60 + 10],
  three_even: [9 * 60 + 43, 12 * 60 + 35, 15 * 60 + 40],
  four_odd: [9 * 60 + 16, 11 * 60 + 10, 13 * 60 + 19, 15 * 60 + 25],
  four_even: [9 * 60 + 43, 11 * 60 + 43, 13 * 60 + 48, 15 * 60 + 58],
  five_odd: [9 * 60 + 10, 10 * 60 + 45, 12 * 60 + 20, 13 * 60 + 55, 15 * 60 + 30],
  five_even: [9 * 60 + 39, 11 * 60 + 14, 12 * 60 + 49, 14 * 60 + 24, 15 * 60 + 59],
} as const

/** Daily targets from PAGA Operating Calendar Rulebook v1.0 §§8–10. */

export type DayTarget = { date: string; targetZar: number; paymentCount: number }

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
  payments: 129,
  plannedValueZar: 660_000,
  arithmeticCeilingZar: 795_000,
  referenceLedgerSha256: 'd2ceef9eb3ca50059fa8ae15d8568c97ecbee848b91bc1e8903a9e332b62d7bf',
  days: [
    { date: '2026-10-01', targetZar: 20_400, paymentCount: 4 },
    { date: '2026-10-02', targetZar: 19_700, paymentCount: 4 },
    { date: '2026-10-03', targetZar: 22_200, paymentCount: 4 },
    { date: '2026-10-05', targetZar: 24_600, paymentCount: 4 },
    { date: '2026-10-06', targetZar: 25_300, paymentCount: 4 },
    { date: '2026-10-07', targetZar: 23_900, paymentCount: 4 },
    { date: '2026-10-08', targetZar: 26_700, paymentCount: 5 },
    { date: '2026-10-09', targetZar: 24_800, paymentCount: 5 },
    { date: '2026-10-10', targetZar: 25_900, paymentCount: 5 },
    { date: '2026-10-12', targetZar: 23_100, paymentCount: 5 },
    { date: '2026-10-13', targetZar: 26_400, paymentCount: 5 },
    { date: '2026-10-14', targetZar: 24_600, paymentCount: 5 },
    { date: '2026-10-15', targetZar: 25_200, paymentCount: 5 },
    { date: '2026-10-16', targetZar: 25_500, paymentCount: 5 },
    { date: '2026-10-17', targetZar: 23_800, paymentCount: 5 },
    { date: '2026-10-19', targetZar: 25_700, paymentCount: 5 },
    { date: '2026-10-20', targetZar: 24_100, paymentCount: 5 },
    { date: '2026-10-21', targetZar: 25_900, paymentCount: 5 },
    { date: '2026-10-22', targetZar: 24_700, paymentCount: 5 },
    { date: '2026-10-23', targetZar: 25_800, paymentCount: 5 },
    { date: '2026-10-24', targetZar: 23_600, paymentCount: 5 },
    { date: '2026-10-26', targetZar: 26_100, paymentCount: 5 },
    { date: '2026-10-27', targetZar: 24_900, paymentCount: 5 },
    { date: '2026-10-28', targetZar: 25_200, paymentCount: 5 },
    { date: '2026-10-29', targetZar: 23_300, paymentCount: 5 },
    { date: '2026-10-30', targetZar: 25_800, paymentCount: 5 },
    { date: '2026-10-31', targetZar: 22_800, paymentCount: 5 },
  ],
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
  payments: 125,
  plannedValueZar: 726_000,
  arithmeticCeilingZar: 750_000,
  authorisedGrowthRate: 0.1,
  newCardId: 'NEW_CARD_M2',
  days: [
    { date: '2026-11-02', targetZar: 28_340, paymentCount: 5 },
    { date: '2026-11-03', targetZar: 29_340, paymentCount: 5 },
    { date: '2026-11-04', targetZar: 29_640, paymentCount: 5 },
    { date: '2026-11-05', targetZar: 28_640, paymentCount: 5 },
    { date: '2026-11-06', targetZar: 29_840, paymentCount: 5 },
    { date: '2026-11-07', targetZar: 28_840, paymentCount: 5 },
    { date: '2026-11-09', targetZar: 29_440, paymentCount: 5 },
    { date: '2026-11-10', targetZar: 28_540, paymentCount: 5 },
    { date: '2026-11-11', targetZar: 29_740, paymentCount: 5 },
    { date: '2026-11-12', targetZar: 28_740, paymentCount: 5 },
    { date: '2026-11-13', targetZar: 29_540, paymentCount: 5 },
    { date: '2026-11-14', targetZar: 28_440, paymentCount: 5 },
    { date: '2026-11-16', targetZar: 29_240, paymentCount: 5 },
    { date: '2026-11-17', targetZar: 28_240, paymentCount: 5 },
    { date: '2026-11-18', targetZar: 29_940, paymentCount: 5 },
    { date: '2026-11-19', targetZar: 28_940, paymentCount: 5 },
    { date: '2026-11-20', targetZar: 29_390, paymentCount: 5 },
    { date: '2026-11-21', targetZar: 28_590, paymentCount: 5 },
    { date: '2026-11-23', targetZar: 29_690, paymentCount: 5 },
    { date: '2026-11-24', targetZar: 28_790, paymentCount: 5 },
    { date: '2026-11-25', targetZar: 29_790, paymentCount: 5 },
    { date: '2026-11-26', targetZar: 28_490, paymentCount: 5 },
    { date: '2026-11-27', targetZar: 29_140, paymentCount: 5 },
    { date: '2026-11-28', targetZar: 28_140, paymentCount: 5 },
    { date: '2026-11-30', targetZar: 28_540, paymentCount: 5 },
  ],
}

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
  four_odd: [9 * 60 + 16, 11 * 60 + 10, 13 * 60 + 19, 15 * 60 + 25],
  four_even: [9 * 60 + 43, 11 * 60 + 43, 13 * 60 + 48, 15 * 60 + 58],
  five_odd: [9 * 60 + 10, 10 * 60 + 45, 12 * 60 + 20, 13 * 60 + 55, 15 * 60 + 30],
  five_even: [9 * 60 + 39, 11 * 60 + 14, 12 * 60 + 49, 14 * 60 + 24, 15 * 60 + 59],
} as const

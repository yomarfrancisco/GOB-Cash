/** Client-facing operating calendar days for principal coordination. */
export type OperatingDayView = {
  date: string
  targetZar: number
  paymentCount: number
}

export const OPERATING_MONTHS = [
  {
    id: '2026-10',
    label: 'October 2026',
    networkState: 'cold_start' as const,
    plannedValueZar: 660_000,
    payments: 129,
    operatingDays: 27,
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
    ] satisfies OperatingDayView[],
  },
  {
    id: '2026-11',
    label: 'November 2026',
    networkState: 'established' as const,
    plannedValueZar: 726_000,
    payments: 125,
    operatingDays: 25,
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
    ] satisfies OperatingDayView[],
  },
] as const

export function activeOperatingMonth(now = new Date()) {
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return OPERATING_MONTHS.find((m) => m.id === key) || OPERATING_MONTHS[0]!
}

export function formatZarShort(n: number): string {
  return `R${Math.round(n).toLocaleString('en-ZA')}`
}

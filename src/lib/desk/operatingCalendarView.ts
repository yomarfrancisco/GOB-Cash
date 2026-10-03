/** Client-facing operating calendar days for principal coordination. */

export type OperatingSlotView = {
  timeSast: string
  attemptMin: number
  amountZar: number
}

export type OperatingDayView = {
  date: string
  targetZar: number
  paymentCount: number
  slots: OperatingSlotView[]
}

const BASE_TIMES = {
  four_odd: [9 * 60 + 16, 11 * 60 + 10, 13 * 60 + 19, 15 * 60 + 25],
  four_even: [9 * 60 + 43, 11 * 60 + 43, 13 * 60 + 48, 15 * 60 + 58],
  five_odd: [9 * 60 + 10, 10 * 60 + 45, 12 * 60 + 20, 13 * 60 + 55, 15 * 60 + 30],
  five_even: [9 * 60 + 39, 11 * 60 + 14, 12 * 60 + 49, 14 * 60 + 24, 15 * 60 + 59],
} as const

const FOUR_PAYMENT_PATTERNS = [
  [0.31, 0.27, 0.23, 0.19],
  [0.29, 0.26, 0.24, 0.21],
  [0.33, 0.25, 0.23, 0.19],
] as const

const FIVE_PAYMENT_PATTERNS_M1 = [
  [0.25, 0.22, 0.2, 0.18, 0.15],
  [0.27, 0.23, 0.19, 0.17, 0.14],
  [0.24, 0.21, 0.2, 0.19, 0.16],
  [0.26, 0.21, 0.19, 0.18, 0.16],
  [0.23, 0.22, 0.21, 0.19, 0.15],
] as const

function money(n: number) {
  return Math.round(n * 100) / 100
}

function roundNearest100(n: number) {
  return Math.round(n / 100) * 100
}

function fmtMin(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function dayOfMonth(iso: string): number {
  return Number(iso.slice(8, 10))
}

function buildDayAmounts(targetZar: number, paymentCount: number, operatingDayIndex0: number): number[] {
  const patterns = paymentCount === 4 ? FOUR_PAYMENT_PATTERNS : FIVE_PAYMENT_PATTERNS_M1
  const pattern = patterns[operatingDayIndex0 % patterns.length]!
  const rotated = [
    ...pattern.slice(operatingDayIndex0 % paymentCount),
    ...pattern.slice(0, operatingDayIndex0 % paymentCount),
  ].slice(0, paymentCount)
  const amounts: number[] = []
  let used = 0
  for (let i = 0; i < paymentCount - 1; i++) {
    const a = roundNearest100(targetZar * rotated[i]!)
    amounts.push(a)
    used += a
  }
  amounts.push(money(targetZar - used))
  return amounts
}

function buildDayTimes(date: string, paymentCount: number): number[] {
  const dom = dayOfMonth(date)
  const odd = dom % 2 === 1
  const base =
    paymentCount === 4
      ? odd
        ? BASE_TIMES.four_odd
        : BASE_TIMES.four_even
      : odd
        ? BASE_TIMES.five_odd
        : BASE_TIMES.five_even
  return base.map((t, i) => {
    const jitter = ((dom * 7 + i * 11) % 9) - 4
    return t + jitter
  })
}

function withSlots(
  days: Array<{ date: string; targetZar: number; paymentCount: number }>
): OperatingDayView[] {
  return days.map((day, operatingDayIndex0) => {
    const amounts = buildDayAmounts(day.targetZar, day.paymentCount, operatingDayIndex0)
    const times = buildDayTimes(day.date, day.paymentCount)
    const slots = amounts.map((amountZar, i) => ({
      timeSast: fmtMin(times[i]!),
      attemptMin: times[i]!,
      amountZar,
    }))
    return { ...day, slots }
  })
}

export const OPERATING_MONTHS = [
  {
    id: '2026-10',
    label: 'October 2026',
    networkState: 'cold_start' as const,
    plannedValueZar: 660_000,
    payments: 129,
    operatingDays: 27,
    days: withSlots([
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
    ]),
  },
  {
    id: '2026-11',
    label: 'November 2026',
    networkState: 'established' as const,
    plannedValueZar: 726_000,
    payments: 125,
    operatingDays: 25,
    days: withSlots([
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
    ]),
  },
] as const

export function activeOperatingMonth(now = new Date()) {
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return OPERATING_MONTHS.find((m) => m.id === key) || OPERATING_MONTHS[0]!
}

export function formatZarShort(n: number): string {
  return `R${Math.round(n).toLocaleString('en-ZA')}`
}

export function formatDayTitle(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, m! - 1, d!))
  return dt.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

/** Half-hour grid covering operating day (09:00–16:30). */
export function dayHalfHourSlots(day: OperatingDayView | null): Array<{
  label: string
  startMin: number
  payment: OperatingSlotView | null
}> {
  const start = 9 * 60
  const end = 16 * 60 + 30
  const byBucket = new Map<number, OperatingSlotView>()
  for (const slot of day?.slots || []) {
    const bucket = Math.floor(slot.attemptMin / 30) * 30
    if (!byBucket.has(bucket)) byBucket.set(bucket, slot)
  }
  const rows: Array<{ label: string; startMin: number; payment: OperatingSlotView | null }> = []
  for (let min = start; min <= end; min += 30) {
    rows.push({
      label: fmtMin(min),
      startMin: min,
      payment: byBucket.get(min) || null,
    })
  }
  return rows
}

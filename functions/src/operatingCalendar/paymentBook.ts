import {
  BASE_TIMES,
  FIVE_PAYMENT_PATTERNS_M1,
  FIVE_PAYMENT_PATTERNS_M2,
  FOUR_PAYMENT_PATTERNS,
  THREE_PAYMENT_PATTERNS,
  TWO_PAYMENT_PATTERNS,
  type DayTarget,
} from './monthFixtures'
import { OPERATING_POLICY_V1 } from './operatingPolicyV1'

export type UnsignedSlot = {
  date: string
  dayIndex0: number
  slotIndex: number
  amountZar: number
  attemptMin: number
  timeSast: string
}

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

function patternsForCount(paymentCount: number, month: 1 | 2): readonly (readonly number[])[] {
  if (paymentCount === 2) return TWO_PAYMENT_PATTERNS
  if (paymentCount === 3) return THREE_PAYMENT_PATTERNS
  if (paymentCount === 4) return FOUR_PAYMENT_PATTERNS
  return month === 1 ? FIVE_PAYMENT_PATTERNS_M1 : FIVE_PAYMENT_PATTERNS_M2
}

export function buildDayAmounts(
  targetZar: number,
  paymentCount: number,
  operatingDayIndex0: number,
  month: 1 | 2
): number[] {
  const patterns = patternsForCount(paymentCount, month)
  const pattern = patterns[operatingDayIndex0 % patterns.length]!
  const rotated = [...pattern.slice(operatingDayIndex0 % paymentCount), ...pattern.slice(0, operatingDayIndex0 % paymentCount)].slice(
    0,
    paymentCount
  )
  const amounts: number[] = []
  let used = 0
  for (let i = 0; i < paymentCount - 1; i++) {
    const a = roundNearest100(targetZar * rotated[i]!)
    amounts.push(a)
    used += a
  }
  amounts.push(money(targetZar - used))
  for (const a of amounts) {
    if (a > OPERATING_POLICY_V1.payment.maxAmountZar) {
      throw new Error(`Payment book amount ${a} exceeds max ${OPERATING_POLICY_V1.payment.maxAmountZar}`)
    }
    if (a <= 0) throw new Error(`Non-positive payment amount ${a}`)
  }
  if (Math.abs(amounts.reduce((s, x) => s + x, 0) - targetZar) > 0.05) {
    throw new Error(`Day amounts do not sum to target ${targetZar}`)
  }
  return amounts
}

export function buildDayTimes(date: string, paymentCount: number): number[] {
  const dom = dayOfMonth(date)
  const odd = dom % 2 === 1
  let base: readonly number[]
  if (paymentCount === 2) base = odd ? BASE_TIMES.two_odd : BASE_TIMES.two_even
  else if (paymentCount === 3) base = odd ? BASE_TIMES.three_odd : BASE_TIMES.three_even
  else if (paymentCount === 4) base = odd ? BASE_TIMES.four_odd : BASE_TIMES.four_even
  else base = odd ? BASE_TIMES.five_odd : BASE_TIMES.five_even
  return base.map((t, i) => {
    const jitter = ((dom * 7 + i * 11) % 9) - 4
    return t + jitter
  })
}

export function buildUnsignedMonthBook(days: DayTarget[], month: 1 | 2): UnsignedSlot[] {
  const slots: UnsignedSlot[] = []
  days.forEach((day, dayIndex0) => {
    const amounts = buildDayAmounts(day.targetZar, day.paymentCount, dayIndex0, month)
    const times = buildDayTimes(day.date, day.paymentCount)
    for (let i = 0; i < day.paymentCount; i++) {
      slots.push({
        date: day.date,
        dayIndex0,
        slotIndex: i,
        amountZar: amounts[i]!,
        attemptMin: times[i]!,
        timeSast: fmtMin(times[i]!),
      })
    }
  })
  return slots
}

/**
 * Continuous monthly calendar engine.
 * Desk may show a rolling 14-day slice; this module owns the full operating month.
 */
import { allocateRoutes, cardsForMonth, type PlannedPayment } from './allocateRoutes'
import {
  emptyContinuityState,
  hashPayload,
  pendingExposureZar,
  rolloverMonth,
  withHashes,
  type ContinuityStateV1,
} from './continuityState'
import { MONTH1_OCTOBER_2026, MONTH2_NOVEMBER_2026, type DayTarget } from './monthFixtures'
import { buildUnsignedMonthBook } from './paymentBook'
import {
  OPERATING_POLICY_V1,
  OPERATING_POLICY_VERSION,
  networkDailyCeilingZar,
  type CardId,
  type NetworkColdState,
} from './operatingPolicyV1'
import { computeLiquidity, validateOperatingCalendar } from './validateCalendar'

export type MonthCalendar = {
  policyVersion: typeof OPERATING_POLICY_VERSION
  month: string
  networkState: NetworkColdState
  days: DayTarget[]
  payments: PlannedPayment[]
  /** Already issued / completed — append-only, not replanned. */
  sealedInstructionIds: string[]
  totalZar: number
  paymentCount: number
  operatingDayCount: number
  liquidity: ReturnType<typeof computeLiquidity>
  continuity: ContinuityStateV1
  inputHash: string
  outputHash: string
  gates: ReturnType<typeof validateOperatingCalendar>
}

export type DeskSlice = {
  viewDays: number
  fromDate: string
  toDate: string
  payments: PlannedPayment[]
  dayProgress: { date: string; plannedZar: number; paymentCount: number }[]
  monthPlannedZar: number
  monthPaymentCount: number
  ceilingTodayZar: number
  remainingMonthCeilingZar: number
  workingLiquidityRequiredZar: number
  workingLiquidityHeadroomZar: number
  pendingExposureZar: number
}

function money(n: number) {
  return Math.round(n * 100) / 100
}

export function planReferenceMonth(month: 1 | 2, prior?: ContinuityStateV1): MonthCalendar {
  const fix = month === 1 ? MONTH1_OCTOBER_2026 : MONTH2_NOVEMBER_2026
  const networkState = fix.networkState as NetworkColdState
  const slots = buildUnsignedMonthBook(fix.days, month)
  const payments = allocateRoutes({
    slots,
    networkState,
    cards: cardsForMonth(month),
    monthLabel: fix.month,
    includeNewCardRamp: month === 2,
  })
  let continuity =
    prior ||
    emptyContinuityState({
      networkState,
      authorisedGrowthRate: month === 2 ? MONTH2_NOVEMBER_2026.authorisedGrowthRate : 0,
    })
  if (month === 2 && prior) {
    continuity = rolloverMonth(prior, MONTH2_NOVEMBER_2026.authorisedGrowthRate)
  }
  // Reference fixture models clean usable outcomes for carry (not live evidence fabrication)
  if (month === 1) {
    continuity = {
      ...continuity,
      networkState: 'established',
      evidenceSupportedDailyCeilingZar: OPERATING_POLICY_V1.network.establishedDailyCeilingZar,
      cardCleanUsableCount: Object.fromEntries(
        cardsForMonth(1).map((c) => [c.cardId, Math.max(7, Math.floor(payments.filter((p) => p.cardId === c.cardId).length * 0.9))])
      ),
      cardMaturityStage: Object.fromEntries(cardsForMonth(1).map((c) => [c.cardId, 'established' as const])),
    }
  }

  const gates = validateOperatingCalendar({
    payments,
    days: fix.days,
    networkState,
    expectedTotalZar: fix.plannedValueZar,
    expectedPaymentCount: fix.payments,
    requireFullMeshContinuity: month === 1,
    enforceReferenceCapitecBand: month === 1,
  })
  const liquidity = computeLiquidity(payments)
  const input = {
    policyVersion: OPERATING_POLICY_VERSION,
    month: fix.month,
    days: fix.days,
    networkState,
    cards: cardsForMonth(month).map((c) => c.cardId),
  }
  const output = {
    payments: payments.map((p) => ({
      invoiceId: p.invoiceId,
      amountZar: p.amountZar,
      cardId: p.cardId,
      terminalId: p.terminalId,
      date: p.date,
      timeSast: p.timeSast,
    })),
  }
  continuity = withHashes(continuity, input, output)

  return {
    policyVersion: OPERATING_POLICY_VERSION,
    month: fix.month,
    networkState,
    days: fix.days,
    payments,
    sealedInstructionIds: [],
    totalZar: money(payments.reduce((s, p) => s + p.amountZar, 0)),
    paymentCount: payments.length,
    operatingDayCount: fix.days.length,
    liquidity,
    continuity,
    inputHash: hashPayload(input),
    outputHash: hashPayload(output),
    gates,
  }
}

/**
 * Replan unfinished future work after interruption / ineligibility / liquidity change.
 * Completed and already-issued instructions remain append-only.
 */
export function replanAfterInterruption(params: {
  calendar: MonthCalendar
  frozenCardId: CardId
  asOfDate: string
  asOfAttemptMin?: number
}): MonthCalendar {
  const { calendar, frozenCardId, asOfDate } = params
  const asOfMin = params.asOfAttemptMin ?? 0
  const sealed = new Set(calendar.sealedInstructionIds)
  const keep = calendar.payments.filter((p) => {
    if (sealed.has(p.instructionId)) return true
    if (p.date < asOfDate) return true
    if (p.date === asOfDate && p.attemptMin <= asOfMin) return true
    return false
  })
  const remainingDays = calendar.days.filter((d) => d.date > asOfDate || (d.date === asOfDate && keep.filter((k) => k.date === d.date).length < d.paymentCount))
  // Rebuild unsigned slots for remaining day capacity and re-allocate with frozen card excluded.
  // Preserve original operating-day indices so cold-start ceilings do not re-apply mid-month.
  const monthNum = calendar.month.startsWith('2026-11') ? 2 : 1
  const residualTargets = remainingDays
    .map((d) => {
      const keptOnDay = keep.filter((k) => k.date === d.date).length
      const keptZar = keep.filter((k) => k.date === d.date).reduce((s, k) => s + k.amountZar, 0)
      return {
        date: d.date,
        targetZar: money(Math.max(0, d.targetZar - keptZar)),
        paymentCount: Math.max(0, d.paymentCount - keptOnDay),
        originalDayIndex0: calendar.days.findIndex((x) => x.date === d.date),
      }
    })
    .filter((d) => d.paymentCount > 0)
  const slots = residualTargets.flatMap((day) => {
    const book = buildUnsignedMonthBook(
      [{ date: day.date, targetZar: day.targetZar, paymentCount: day.paymentCount }],
      monthNum
    )
    return book.map((slot) => ({ ...slot, dayIndex0: day.originalDayIndex0 }))
  })
  const cards = cardsForMonth(monthNum).filter((c) => c.cardId !== frozenCardId)
  // After cold network days, replan under established ceilings even if the fixture began cold_start.
  const replanNetworkState =
    residualTargets.some((d) => d.originalDayIndex0 >= OPERATING_POLICY_V1.network.coldNetworkDays)
      ? 'established'
      : calendar.networkState
  const replanned =
    slots.length === 0
      ? []
      : allocateRoutes({
          slots,
          networkState: replanNetworkState,
          cards,
          monthLabel: `${calendar.month}-R`,
          includeNewCardRamp: monthNum === 2,
        })
  const continuity = {
    ...calendar.continuity,
    frozenCardIds: calendar.continuity.frozenCardIds.includes(frozenCardId)
      ? calendar.continuity.frozenCardIds
      : [...calendar.continuity.frozenCardIds, frozenCardId],
  }
  const payments = [...keep, ...replanned].sort((a, b) =>
    a.date === b.date ? a.attemptMin - b.attemptMin : a.date < b.date ? -1 : 1
  )
  return {
    ...calendar,
    payments,
    continuity,
    totalZar: money(payments.reduce((s, p) => s + p.amountZar, 0)),
    paymentCount: payments.length,
    liquidity: computeLiquidity(payments),
  }
}

export function rollingDeskSlice(params: {
  calendar: MonthCalendar
  asOfDate: string
  viewDays?: number
  availableWorkingLiquidityZar?: number
}): DeskSlice {
  const viewDays = params.viewDays ?? 14
  const dates = [...new Set(params.calendar.payments.map((p) => p.date))].sort()
  const startIdx = Math.max(0, dates.findIndex((d) => d >= params.asOfDate))
  const window = dates.slice(startIdx, startIdx + viewDays)
  const fromDate = window[0] || params.asOfDate
  const toDate = window[window.length - 1] || params.asOfDate
  const payments = params.calendar.payments.filter((p) => p.date >= fromDate && p.date <= toDate)
  const dayProgress = window.map((date) => {
    const dayPays = payments.filter((p) => p.date === date)
    return {
      date,
      plannedZar: money(dayPays.reduce((s, p) => s + p.amountZar, 0)),
      paymentCount: dayPays.length,
    }
  })
  const dayIndex1 = dates.findIndex((d) => d === params.asOfDate) + 1 || 1
  const ceilingTodayZar = networkDailyCeilingZar(dayIndex1, params.calendar.networkState)
  const monthDaysLeft = params.calendar.days.filter((d) => d.date >= params.asOfDate)
  const remainingMonthCeilingZar = money(
    monthDaysLeft.reduce((s, d, i) => {
      const idx = dayIndex1 + i
      return s + networkDailyCeilingZar(idx, params.calendar.networkState)
    }, 0)
  )
  const required = params.calendar.liquidity.requiredWorkingLiquidityZar
  const available = params.availableWorkingLiquidityZar ?? params.calendar.continuity.workingLiquidityZar
  return {
    viewDays,
    fromDate,
    toDate,
    payments,
    dayProgress,
    monthPlannedZar: params.calendar.totalZar,
    monthPaymentCount: params.calendar.paymentCount,
    ceilingTodayZar,
    remainingMonthCeilingZar,
    workingLiquidityRequiredZar: required,
    workingLiquidityHeadroomZar: money(available - required),
    pendingExposureZar: pendingExposureZar(params.calendar.continuity),
  }
}

/** Without explicit growth authority, Month 2 stays at prior evidence-supported ceiling volume. */
export function month2VolumeWithoutGrowthAuthority(month1PlannedZar: number): number {
  return month1PlannedZar
}

export function month2VolumeWithGrowthAuthority(month1PlannedZar: number, rate: number): number {
  return money(month1PlannedZar * (1 + rate))
}

/**
 * Conversational ZAR sales-schedule amendments through Sam.
 * Planning-only: never authorises, captures, settles, or fabricates payments.
 * Append-only plan versions; committed financial events are preserved.
 */

import { OPERATING_POLICY_V1 } from '../operatingCalendar/operatingPolicyV1'
import { sastParts, sastToUtcMs, type SastParts } from './routingTime'
import type { CyclePhase } from './continuousCycle'
import { stepForPhase } from './continuousCycle'

export const SALES_SCHEDULE_ACTION = 'revise_sales_schedule' as const

export type ScheduleReasonClass =
  | 'operator_supply_revision'
  | 'demand_revision'
  | 'route_evidence'

export type SalesScheduleProposal = {
  action: typeof SALES_SCHEDULE_ACTION
  effectiveDate: string
  dailyAmountZar?: number | null
  dateOverrides: Record<string, number>
  weekdayMask?: number[] | null
  defaultFrom?: { date: string; dailyAmountZar: number } | null
  reasonClass: ScheduleReasonClass
  expectedPlanVersion: number
  idempotencyKey?: string
  summary?: string
}

export type SalesScheduleState = {
  planVersion: number
  /** ISO SAST calendar dates → operator-confirmed daily intake caps (ZAR). */
  dateOverrides: Record<string, number>
  /** From this date forward, default daily cap when no override. */
  defaultFrom?: { date: string; dailyAmountZar: number } | null
  /** Allowed weekdays (0=Sun…6=Sat). Null = unchanged network Mon–Sat. */
  weekdayMask?: number[] | null
  residualOpenZar: number
  projectedCompletionDate: string | null
  policyVersion: string
  stateHash: string
  updatedAtMs: number
}

export type CommittedFloorInput = {
  deskStep: number
  cyclePhase?: CyclePhase | string | null
  expectedOrderZar: number
  deployedAmount: number
  /** ZAR already authorised / captured / sent / usable this day. */
  committedZar: number
  cycleStatus?: string | null
}

export type AmendContext = {
  nowMs: number
  plan: SalesScheduleState
  floor: CommittedFloorInput
  /** Previous planned daily amount for the effective date (before amendment). */
  previousDailyAmountZar: number
  /** Safe capacity ceiling for any single day (policy + liquidity). */
  safeDailyCeilingZar: number
  /** Operating days remaining in the rolling view (for completion projection). */
  horizonOperatingDays?: number
  beliefFingerprintBefore: string
}

export type AmendApplyResult =
  | {
      ok: true
      status: 'applied' | 'idempotent'
      proposal: SalesScheduleProposal
      previousPlan: SalesScheduleState
      nextPlan: SalesScheduleState
      effectiveDate: string
      previousDailyAmountZar: number
      revisedDailyAmountZar: number
      committedFloorZar: number
      remainingToScheduleZar: number
      residualBeforeZar: number
      residualAfterZar: number
      previousProjectedCompletionDate: string | null
      revisedProjectedCompletionDate: string | null
      supersededInstructionIds: string[]
      newlyPlannedInstructionIds: string[]
      explanation: string
      beliefFingerprintAfter: string
      touchedBeliefs: boolean
    }
  | {
      ok: false
      status: 'rejected' | 'needs_clarification' | 'stale_version'
      clarification: string
      currentPlanVersion: number
    }

const WEEKDAY_NAME: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
}

const WEEKDAY_LABEL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function emptySalesSchedule(nowMs = Date.now()): SalesScheduleState {
  return {
    planVersion: 1,
    dateOverrides: {},
    defaultFrom: null,
    weekdayMask: null,
    residualOpenZar: 0,
    projectedCompletionDate: null,
    policyVersion: OPERATING_POLICY_V1.version,
    stateHash: hashScheduleState({
      planVersion: 1,
      dateOverrides: {},
      defaultFrom: null,
      weekdayMask: null,
      residualOpenZar: 0,
    }),
    updatedAtMs: nowMs,
  }
}

export function salesScheduleFromDoc(data: Record<string, unknown> | null | undefined): SalesScheduleState {
  const raw = data?.salesSchedule
  if (!raw || typeof raw !== 'object') return emptySalesSchedule()
  const row = raw as Record<string, unknown>
  const overrides: Record<string, number> = {}
  if (row.dateOverrides && typeof row.dateOverrides === 'object') {
    for (const [k, v] of Object.entries(row.dateOverrides as Record<string, unknown>)) {
      const n = Number(v)
      if (Number.isFinite(n) && n >= 0) overrides[k] = roundZar(n)
    }
  }
  const defaultFrom =
    row.defaultFrom && typeof row.defaultFrom === 'object'
      ? {
          date: String((row.defaultFrom as { date?: string }).date || ''),
          dailyAmountZar: roundZar(Number((row.defaultFrom as { dailyAmountZar?: number }).dailyAmountZar) || 0),
        }
      : null
  const mask = Array.isArray(row.weekdayMask)
    ? row.weekdayMask.map((n) => Number(n)).filter((n) => n >= 0 && n <= 6)
    : null
  return {
    planVersion: Math.max(1, Math.floor(Number(row.planVersion) || 1)),
    dateOverrides: overrides,
    defaultFrom: defaultFrom?.date ? defaultFrom : null,
    weekdayMask: mask && mask.length ? mask : null,
    residualOpenZar: roundZar(Number(row.residualOpenZar) || 0),
    projectedCompletionDate:
      typeof row.projectedCompletionDate === 'string' ? row.projectedCompletionDate : null,
    policyVersion: typeof row.policyVersion === 'string' ? row.policyVersion : OPERATING_POLICY_V1.version,
    stateHash: typeof row.stateHash === 'string' ? row.stateHash : '',
    updatedAtMs: Number(row.updatedAtMs) || 0,
  }
}

export function isoDateFromParts(p: Pick<SastParts, 'year' | 'month' | 'day'>): string {
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

export function sastIsoDate(nowMs: number): string {
  return isoDateFromParts(sastParts(nowMs))
}

export function addSastCalendarDays(isoDate: string, deltaDays: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const ms = sastToUtcMs(y!, m!, d!, 12, 0) + deltaDays * 86_400_000
  return sastIsoDate(ms)
}

export function isOperatingDayIso(isoDate: string, weekdayMask?: number[] | null): boolean {
  const [y, m, d] = isoDate.split('-').map(Number)
  const wd = sastParts(sastToUtcMs(y!, m!, d!, 12, 0)).weekday
  if (weekdayMask && weekdayMask.length) return weekdayMask.includes(wd)
  return wd >= 1 && wd <= 6 // Mon–Sat
}

export function committedFloorZar(input: CommittedFloorInput): number {
  const step =
    input.deskStep > 0
      ? input.deskStep
      : stepForPhase(input.cyclePhase) || 1
  const explicit = Math.max(0, roundZar(input.committedZar))
  if (explicit > 0) return explicit

  // Steps 1–3: draft / cover — nothing irrevocable yet unless caller stamped committedZar.
  if (step <= 3) return 0

  // Step 4+: if the cycle is still awaiting execution, only prior explicit commits count.
  const status = (input.cycleStatus || '').toLowerCase()
  if (status === 'awaiting_execution' || status === 'pending_mzn' || status === '') {
    return 0
  }
  if (status === 'completed' || status === 'authorised' || status === 'captured' || status === 'executed') {
    return Math.max(0, roundZar(input.deployedAmount || input.expectedOrderZar || 0))
  }
  // Step 5–6 with open recycle: treat deployed/sent amount as the floor.
  if (step >= 5) {
    return Math.max(0, roundZar(input.deployedAmount || input.expectedOrderZar || 0))
  }
  return 0
}

export function plannedIntakeZar(params: {
  operatorConfirmedZar: number
  confirmedDemandZar: number
  safeNetworkCapacityZar: number
  workingLiquidityHeadroomZar: number
  eligibleRouteCapacityZar: number
}): number {
  return roundZar(
    Math.max(
      0,
      Math.min(
        params.operatorConfirmedZar,
        params.confirmedDemandZar,
        params.safeNetworkCapacityZar,
        params.workingLiquidityHeadroomZar,
        params.eligibleRouteCapacityZar
      )
    )
  )
}

/** Resolve the operator cap for a date from the schedule (overrides > defaultFrom > previous). */
export function dailyCapForDate(
  plan: SalesScheduleState,
  isoDate: string,
  fallbackZar: number
): number {
  if (Object.prototype.hasOwnProperty.call(plan.dateOverrides, isoDate)) {
    return roundZar(plan.dateOverrides[isoDate]!)
  }
  if (plan.defaultFrom && isoDate >= plan.defaultFrom.date) {
    return roundZar(plan.defaultFrom.dailyAmountZar)
  }
  return roundZar(fallbackZar)
}

export function looksLikeSalesScheduleAmendment(message: string): boolean {
  const text = message.trim().toLowerCase()
  if (!text) return false
  if (
    /\b(park|retire|exclude|restore|prefer|don't use|do not use|freeze|declined|unpaid)\b/.test(text) &&
    !/\b(sell|sale|sales|intake|schedule|cap)\b/.test(text)
  ) {
    return false
  }
  if (
    /\b(no (?:zar )?sales?|zero (?:zar )?sales?|skip (?:the )?day|carry (?:everything |it )?forward)\b/.test(
      text
    )
  ) {
    return true
  }
  if (
    /\b(reduce|increase|cap|change|revise|amend|set|only sell|can only sell|sell only)\b/.test(text) &&
    /\b(r\s?[\d]|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|schedule|per day|daily|zar\s+sales?|sales?\s+to)\b/.test(
      text
    )
  ) {
    return true
  }
  // "change this cycle's ZAR sales to R20000"
  if (/\bzar\s+sales?\b/.test(text) && /\b(change|reduce|increase|set|cap)\b/.test(text) && /r\s*[\d]/.test(text)) {
    return true
  }
  if (/\b(extend the schedule|from tomorrow|next week)\b/.test(text) && /\b(r\s?[\d]|accept|sell|only)\b/.test(text)) {
    return true
  }
  if (/\bmahom+ed\b/.test(text) && /\b(r\s?[\d]|accept|only)\b/.test(text)) return true
  return false
}

export function parseSalesScheduleAmendment(
  message: string,
  params: {
    nowMs: number
    expectedPlanVersion: number
    reasonHint?: ScheduleReasonClass
  }
): SalesScheduleProposal | { clarification: string } {
  const text = message.trim()
  if (!text) return { clarification: 'Which day’s ZAR sale should I change, and to what amount?' }

  const reasonClass: ScheduleReasonClass =
    params.reasonHint ||
    (/\bmahom+ed\b/i.test(text) || /\bdemand\b/i.test(text) || /\baccept\b/i.test(text) && /\bonly\b/i.test(text)
      ? 'demand_revision'
      : 'operator_supply_revision')

  const today = sastIsoDate(params.nowMs)
  const tomorrow = addSastCalendarDays(today, 1)
  const overrides: Record<string, number> = {}
  let dailyAmountZar: number | null = null
  let effectiveDate = today
  let weekdayMask: number[] | null = null
  let summary = ''

  const amount = zarAmountFromText(text)
  const lower = text.toLowerCase()

  // "No ZAR sales on Wednesday. Carry everything forward."
  const noSalesDay = lower.match(
    /\bno(?:\s+zar)?\s+sales?\s+on\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/
  )
  if (noSalesDay) {
    const iso = nextWeekdayIso(params.nowMs, WEEKDAY_NAME[noSalesDay[1]!]!)
    overrides[iso] = 0
    effectiveDate = iso
    summary = `Zero intake on ${WEEKDAY_LABEL[WEEKDAY_NAME[noSalesDay[1]!]!]}; residual carries forward.`
    return finalizeProposal({
      effectiveDate,
      dailyAmountZar: 0,
      dateOverrides: overrides,
      reasonClass,
      expectedPlanVersion: params.expectedPlanVersion,
      summary,
      message: text,
    })
  }

  // "Change next week to Monday, Wednesday and Friday only."
  if (/\bnext week\b/.test(lower) && /\bonly\b/.test(lower)) {
    const named = [...lower.matchAll(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/g)].map(
      (m) => WEEKDAY_NAME[m[1]!]!
    )
    if (named.length >= 2) {
      weekdayMask = [...new Set(named)]
      effectiveDate = nextMondayIso(params.nowMs)
      // Zero the other operating days in the next 7 calendar days from Monday.
      for (let i = 0; i < 7; i++) {
        const iso = addSastCalendarDays(effectiveDate, i)
        const wd = sastParts(sastToUtcMs(...ymd(iso), 12, 0)).weekday
        if (wd === 0) continue
        if (!weekdayMask.includes(wd)) overrides[iso] = 0
      }
      summary = `Next week limited to ${weekdayMask.map((d) => WEEKDAY_LABEL[d]).join(', ')}.`
      return finalizeProposal({
        effectiveDate,
        dailyAmountZar: null,
        dateOverrides: overrides,
        weekdayMask,
        reasonClass,
        expectedPlanVersion: params.expectedPlanVersion,
        summary,
        message: text,
      })
    }
  }

  // Multi: "Cap Thursday and Friday at R15,000 each."
  const multiCap = lower.match(
    /\b(?:cap|limit)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+and\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+at\s+(r?\s?[\d\s,.]+)/
  )
  if (multiCap && amount != null) {
    const a = nextWeekdayIso(params.nowMs, WEEKDAY_NAME[multiCap[1]!]!)
    const b = nextWeekdayIso(params.nowMs, WEEKDAY_NAME[multiCap[2]!]!)
    overrides[a] = amount
    overrides[b] = amount
    effectiveDate = a < b ? a : b
    summary = `Cap ${WEEKDAY_LABEL[WEEKDAY_NAME[multiCap[1]!]!]} and ${WEEKDAY_LABEL[WEEKDAY_NAME[multiCap[2]!]!]} at ${formatZarPlain(amount)} each.`
    return finalizeProposal({
      effectiveDate,
      dailyAmountZar: amount,
      dateOverrides: overrides,
      reasonClass,
      expectedPlanVersion: params.expectedPlanVersion,
      summary,
      message: text,
    })
  }

  // "From tomorrow, I can sell R20,000 per day."
  if (/\bfrom tomorrow\b/.test(lower) && amount != null) {
    effectiveDate = tomorrow
    dailyAmountZar = amount
    summary = `From tomorrow, daily ZAR sales capped at ${formatZarPlain(amount)}.`
    return finalizeProposal({
      effectiveDate,
      dailyAmountZar,
      dateOverrides: {},
      defaultFrom: { date: tomorrow, dailyAmountZar: amount },
      reasonClass,
      expectedPlanVersion: params.expectedPlanVersion,
      summary,
      message: text,
    })
  }

  // Resolve target day
  if (/\btomorrow\b/.test(lower)) effectiveDate = tomorrow
  else if (/\btoday\b/.test(lower)) effectiveDate = today
  else {
    const wd = lower.match(/\bon\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/)
    if (wd) effectiveDate = nextWeekdayIso(params.nowMs, WEEKDAY_NAME[wd[1]!]!)
    else {
      const bare = lower.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/)
      if (bare && amount != null) effectiveDate = nextWeekdayIso(params.nowMs, WEEKDAY_NAME[bare[1]!]!)
    }
  }

  if (amount == null && Object.keys(overrides).length === 0) {
    return {
      clarification:
        'Tell me the day and the ZAR amount — for example “Reduce today’s ZAR sale to R12,000.”',
    }
  }

  if (amount != null) {
    dailyAmountZar = amount
    overrides[effectiveDate] = amount
    summary = `Set ${effectiveDate} ZAR sale to ${formatZarPlain(amount)}.`
  }

  return finalizeProposal({
    effectiveDate,
    dailyAmountZar,
    dateOverrides: overrides,
    reasonClass,
    expectedPlanVersion: params.expectedPlanVersion,
    summary,
    message: text,
  })
}

function finalizeProposal(input: {
  effectiveDate: string
  dailyAmountZar: number | null
  dateOverrides: Record<string, number>
  weekdayMask?: number[] | null
  defaultFrom?: { date: string; dailyAmountZar: number } | null
  reasonClass: ScheduleReasonClass
  expectedPlanVersion: number
  summary: string
  message: string
}): SalesScheduleProposal {
  return {
    action: SALES_SCHEDULE_ACTION,
    effectiveDate: input.effectiveDate,
    dailyAmountZar: input.dailyAmountZar,
    dateOverrides: input.dateOverrides,
    weekdayMask: input.weekdayMask ?? null,
    defaultFrom: input.defaultFrom ?? null,
    reasonClass: input.reasonClass,
    expectedPlanVersion: input.expectedPlanVersion,
    idempotencyKey: idempotencyKeyFor(input.message, input.expectedPlanVersion, input.effectiveDate),
    summary: input.summary,
  }
}

export function applySalesScheduleAmendment(
  proposal: SalesScheduleProposal,
  ctx: AmendContext
): AmendApplyResult {
  const current = ctx.plan

  if (proposal.expectedPlanVersion !== current.planVersion) {
    return {
      ok: false,
      status: 'stale_version',
      clarification: `Plan is now at version ${current.planVersion}. Re-read the current schedule and send the amendment again.`,
      currentPlanVersion: current.planVersion,
    }
  }

  if (!proposal.effectiveDate || !/^\d{4}-\d{2}-\d{2}$/.test(proposal.effectiveDate)) {
    return {
      ok: false,
      status: 'needs_clarification',
      clarification: 'I need a calendar date in SAST for the amendment.',
      currentPlanVersion: current.planVersion,
    }
  }

  // Sunday: zero intake is always fine. Non-zero intake is allowed when amending the
  // already-open desk day ("today"), but an explicit future Sunday schedule is rejected.
  const effParts = ymd(proposal.effectiveDate)
  const effWd = sastParts(sastToUtcMs(effParts[0], effParts[1], effParts[2], 12, 0)).weekday
  const todayIso = sastIsoDate(ctx.nowMs)
  const requestedRaw =
    proposal.dateOverrides[proposal.effectiveDate] ??
    (proposal.dailyAmountZar != null ? proposal.dailyAmountZar : null)

  if (
    requestedRaw != null &&
    requestedRaw > 0 &&
    effWd === 0 &&
    proposal.effectiveDate !== todayIso
  ) {
    return {
      ok: false,
      status: 'needs_clarification',
      clarification: 'Sunday has no new intake. Name an operating day (Monday–Saturday) for that amount.',
      currentPlanVersion: current.planVersion,
    }
  }

  const floor = committedFloorZar(ctx.floor)
  const previousDaily = roundZar(ctx.previousDailyAmountZar)
  const residualBefore = roundZar(current.residualOpenZar)

  // Merge overrides
  const nextOverrides = { ...current.dateOverrides }
  for (const [iso, amt] of Object.entries(proposal.dateOverrides || {})) {
    nextOverrides[iso] = roundZar(amt)
  }

  let revisedDaily = previousDaily
  if (requestedRaw != null) {
    const capped = plannedIntakeZar({
      operatorConfirmedZar: requestedRaw,
      confirmedDemandZar: requestedRaw,
      safeNetworkCapacityZar: ctx.safeDailyCeilingZar,
      workingLiquidityHeadroomZar: ctx.safeDailyCeilingZar,
      eligibleRouteCapacityZar: ctx.safeDailyCeilingZar,
    })
    revisedDaily = Math.max(floor, capped)
    nextOverrides[proposal.effectiveDate] = revisedDaily
  } else if (Object.keys(proposal.dateOverrides).length) {
    revisedDaily = dailyCapForDate(
      { ...current, dateOverrides: nextOverrides },
      proposal.effectiveDate,
      previousDaily
    )
    if (revisedDaily < floor) {
      revisedDaily = floor
      nextOverrides[proposal.effectiveDate] = floor
    }
  }

  // Shortfall vs previous plan becomes residual — never added to tomorrow's target.
  const unserved = Math.max(0, previousDaily - revisedDaily)
  // When raising the day, residual can absorb into today's remaining capacity.
  const absorb = Math.max(0, revisedDaily - previousDaily)
  let residualAfter = residualBefore + unserved - Math.min(residualBefore, absorb)
  residualAfter = roundZar(Math.max(0, residualAfter))

  // If operator asked below floor, keep floor and carry the gap they hoped to cut as residual? No —
  // the unserved relative to previous already carries the reduction; the part they wanted below floor
  // stays committed (not residual).
  if (requestedRaw != null && requestedRaw < floor) {
    // residual from previous→floor only
    residualAfter = roundZar(residualBefore + Math.max(0, previousDaily - floor))
    revisedDaily = floor
    nextOverrides[proposal.effectiveDate] = floor
  }

  const remainingToSchedule = roundZar(Math.max(0, revisedDaily - floor))

  const defaultFrom = proposal.defaultFrom !== undefined ? proposal.defaultFrom : current.defaultFrom

  const weekdayMask = proposal.weekdayMask ?? current.weekdayMask ?? null

  const previousCompletion = current.projectedCompletionDate
  const projectedFromResidual = projectCompletionDate({
    fromDate: proposal.effectiveDate,
    residualZar: residualAfter,
    dailyReferenceZar: Math.max(
      1,
      revisedDaily > 0
        ? revisedDaily
        : defaultFrom?.dailyAmountZar || previousDaily || ctx.safeDailyCeilingZar || 1
    ),
    weekdayMask,
    nowMs: ctx.nowMs,
  })
  const revisedCompletion =
    previousCompletion && previousCompletion > projectedFromResidual
      ? previousCompletion
      : projectedFromResidual
  // When residual grew, completion must not move earlier than the prior projection.
  const revisedCompletionFinal =
    residualAfter > residualBefore && previousCompletion
      ? projectCompletionDate({
          fromDate: previousCompletion,
          residualZar: Math.max(0, residualAfter - residualBefore),
          dailyReferenceZar: Math.max(1, revisedDaily || previousDaily || 1),
          weekdayMask,
          nowMs: ctx.nowMs,
        })
      : revisedCompletion

  const nextPlan: SalesScheduleState = {
    planVersion: current.planVersion + 1,
    dateOverrides: nextOverrides,
    defaultFrom,
    weekdayMask,
    residualOpenZar: residualAfter,
    projectedCompletionDate: revisedCompletionFinal,
    policyVersion: OPERATING_POLICY_V1.version,
    stateHash: '',
    updatedAtMs: ctx.nowMs,
  }
  nextPlan.stateHash = hashScheduleState(nextPlan)

  // Idempotency: identical resulting schedule → same version content (caller may short-circuit before bump)
  const beliefAfter = ctx.beliefFingerprintBefore
  const explanation = buildAmendmentExplanation({
    effectiveDate: proposal.effectiveDate,
    previousDaily,
    revisedDaily,
    floor,
    remainingToSchedule,
    residualAfter,
    previousCompletion,
    revisedCompletion: revisedCompletionFinal,
    requestedRaw,
    reasonClass: proposal.reasonClass,
  })

  return {
    ok: true,
    status: 'applied',
    proposal,
    previousPlan: current,
    nextPlan,
    effectiveDate: proposal.effectiveDate,
    previousDailyAmountZar: previousDaily,
    revisedDailyAmountZar: revisedDaily,
    committedFloorZar: floor,
    remainingToScheduleZar: remainingToSchedule,
    residualBeforeZar: residualBefore,
    residualAfterZar: residualAfter,
    previousProjectedCompletionDate: previousCompletion,
    revisedProjectedCompletionDate: revisedCompletionFinal,
    supersededInstructionIds: remainingToSchedule < previousDaily - floor ? [`unissued-after-${proposal.effectiveDate}`] : [],
    newlyPlannedInstructionIds: remainingToSchedule > 0 ? [`planned-${proposal.effectiveDate}-v${nextPlan.planVersion}`] : [],
    explanation,
    beliefFingerprintAfter: beliefAfter,
    touchedBeliefs: false,
  }
}

export function projectCompletionDate(params: {
  fromDate: string
  residualZar: number
  dailyReferenceZar: number
  weekdayMask?: number[] | null
  nowMs: number
}): string {
  const daily = Math.max(1, roundZar(params.dailyReferenceZar))
  let extraDays = params.residualZar > 0 ? Math.ceil(params.residualZar / daily) : 0
  let cursor = params.fromDate
  // Walk forward at least through remaining horizon; Sunday skipped.
  let guard = 0
  while (extraDays > 0 && guard < 370) {
    cursor = addSastCalendarDays(cursor, 1)
    guard++
    if (!isOperatingDayIso(cursor, params.weekdayMask)) continue
    extraDays--
  }
  // Also ensure cursor itself is an operating day when residual is 0.
  guard = 0
  while (!isOperatingDayIso(cursor, params.weekdayMask) && guard < 14) {
    cursor = addSastCalendarDays(cursor, 1)
    guard++
  }
  return cursor
}

export function buildAmendmentExplanation(params: {
  effectiveDate: string
  previousDaily: number
  revisedDaily: number
  floor: number
  remainingToSchedule: number
  residualAfter: number
  previousCompletion: string | null
  revisedCompletion: string | null
  requestedRaw: number | null
  reasonClass: ScheduleReasonClass
}): string {
  const lines: string[] = []
  if (params.requestedRaw != null && params.requestedRaw < params.floor) {
    lines.push(
      `${formatZarPlain(params.floor)} is already committed, so that is today’s minimum. I’ve removed the remaining unissued instructions and carried the balance forward.`
    )
  } else if (params.revisedDaily < params.previousDaily) {
    lines.push(
      `Done. I’ve reduced ${params.effectiveDate} from ${formatZarPlain(params.previousDaily)} to ${formatZarPlain(params.revisedDaily)}.`
    )
  } else if (params.revisedDaily > params.previousDaily) {
    lines.push(
      `Done. I’ve increased ${params.effectiveDate} from ${formatZarPlain(params.previousDaily)} to ${formatZarPlain(params.revisedDaily)}.`
    )
  } else {
    lines.push(`Done. I’ve revised the schedule from ${params.effectiveDate}.`)
  }

  if (params.floor > 0 && !(params.requestedRaw != null && params.requestedRaw < params.floor)) {
    lines.push(
      `${formatZarPlain(params.floor)} was already committed, so I replanned the remaining ${formatZarPlain(params.remainingToSchedule)}.`
    )
  } else if (params.remainingToSchedule > 0 && params.floor === 0) {
    lines.push(`I rebuilt the day for ${formatZarPlain(params.remainingToSchedule)}.`)
  }

  lines.push(`${formatZarPlain(params.residualAfter)} remains open as residual.`)
  lines.push('Tomorrow has not been increased; residual extends the timeline instead.')

  if (params.previousCompletion && params.revisedCompletion && params.previousCompletion !== params.revisedCompletion) {
    lines.push(
      `Expected completion moves from ${formatHumanDate(params.previousCompletion)} to ${formatHumanDate(params.revisedCompletion)}.`
    )
  } else if (params.revisedCompletion) {
    lines.push(`Expected completion: ${formatHumanDate(params.revisedCompletion)}.`)
  }

  return lines.join(' ')
}

export function formatPlanRevisedBody(result: Extract<AmendApplyResult, { ok: true }>): string {
  return [
    `Effective ${result.effectiveDate}.`,
    `Previous daily ${formatZarPlain(result.previousDailyAmountZar)} → revised ${formatZarPlain(result.revisedDailyAmountZar)}.`,
    `Committed ${formatZarPlain(result.committedFloorZar)}.`,
    `Remaining to schedule today ${formatZarPlain(result.remainingToScheduleZar)}.`,
    `Residual ${formatZarPlain(result.residualBeforeZar)} → ${formatZarPlain(result.residualAfterZar)}.`,
    `Completion ${result.previousProjectedCompletionDate || '—'} → ${result.revisedProjectedCompletionDate || '—'}.`,
    'Tomorrow was not increased to absorb the shortfall.',
  ].join('\n')
}

export function beliefFingerprint(input: {
  pathResiduals?: unknown
  routeEvidenceVersion?: string | number | null
  pairings?: Record<string, number> | null
}): string {
  return hashScheduleState({
    pathResiduals: input.pathResiduals ?? null,
    routeEvidenceVersion: input.routeEvidenceVersion ?? null,
    pairings: input.pairings ?? null,
  })
}

export function roundZar(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.round(n * 100) / 100
}

export function zarAmountFromText(message: string): number | null {
  const m = message.replace(/,/g, '').match(/r\s*([\d]+(?:\.\d+)?)/i)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n >= 0 ? roundZar(n) : null
}

export function idempotencyKeyFor(message: string, planVersion: number, effectiveDate: string): string {
  const norm = message.trim().toLowerCase().replace(/\s+/g, ' ')
  return hashScheduleState({ norm, planVersion, effectiveDate })
}

export function hashScheduleState(value: unknown): string {
  const json = JSON.stringify(value)
  let h = 2166136261
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

function formatZarPlain(n: number): string {
  return `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function formatHumanDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const ms = sastToUtcMs(y!, m!, d!, 12, 0)
  const p = sastParts(ms)
  return `${WEEKDAY_LABEL[p.weekday]} ${p.day} ${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][p.month - 1]}`
}

function nextWeekdayIso(nowMs: number, targetDow: number): string {
  const p = sastParts(nowMs)
  let delta = (targetDow - p.weekday + 7) % 7
  // If asking mid-day for "today's weekday name", keep today.
  if (delta === 0) return isoDateFromParts(p)
  return addSastCalendarDays(isoDateFromParts(p), delta)
}

function nextMondayIso(nowMs: number): string {
  const p = sastParts(nowMs)
  let delta = (1 - p.weekday + 7) % 7
  if (delta === 0) delta = 7 // next week Monday when already Monday
  return addSastCalendarDays(isoDateFromParts(p), delta)
}

function ymd(iso: string): [number, number, number] {
  const [y, m, d] = iso.split('-').map(Number)
  return [y!, m!, d!]
}

/** Stage guidance for callers — pure documentation of replan scope. */
export function replanScopeForStep(deskStep: number): {
  mayRebuildFullDay: boolean
  preserveCommitted: boolean
  applyFromNextDay: boolean
} {
  if (deskStep <= 0) return { mayRebuildFullDay: true, preserveCommitted: false, applyFromNextDay: false }
  if (deskStep === 1 || deskStep === 2) return { mayRebuildFullDay: true, preserveCommitted: false, applyFromNextDay: false }
  if (deskStep === 3) return { mayRebuildFullDay: true, preserveCommitted: true, applyFromNextDay: false }
  if (deskStep === 4 || deskStep === 5) return { mayRebuildFullDay: false, preserveCommitted: true, applyFromNextDay: false }
  // Step 6 closed → next open day
  return { mayRebuildFullDay: true, preserveCommitted: true, applyFromNextDay: true }
}

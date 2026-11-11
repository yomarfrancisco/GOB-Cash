/**
 * Client-facing over-instant routing plan.
 *
 * Dual-rail doctrine:
 * - Card-promised = planned day target from POS/card infrastructure (Mon–Sat).
 * - Excess → EFT bulk in parallel, hard clear T+2 banking days.
 * - Card pack covers the EFT window (t+0…t+2 operating days); remainder is EFT.
 * - If EFT slips past T+2: continue card + re-instruct EFT (note + operational).
 * Never emits "Guaranteed".
 */

import { OPERATING_POLICY_V1 } from '../operatingCalendar/operatingPolicyV1'
import {
  EFT_POLICY_V1,
  bankingDeadlineIso,
} from '../routing/channelSplit'
import { DAILY_LIQUID_ZAR_CAP } from './dailyLiquidZar'
import { roundMajor } from './reserveBooks'

const SAST_OFFSET_MS = 2 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const OPEN_HOUR = 9
const OPEN_MINUTE = 0
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Established-network planned day target (card/POS infrastructure). */
export const PLANNED_CARD_DAY_TARGET_ZAR =
  OPERATING_POLICY_V1.network.establishedDailyCeilingZar

/** Operating days of card pack that run in parallel with one EFT T+2 clock. */
export const CARD_EFT_OVERLAP_OPERATING_DAYS = 3

export type RoutingPlanConfidence = 'now' | 'reserved' | 'estimated'
export type RoutingPlanChannel = 'instant' | 'card' | 'eft'

export type RoutingPlanLeg = {
  whenLabel: string
  subLabel: string
  amountZar: number
  confidence: RoutingPlanConfidence
  /** Display chip — never "Guaranteed" in v1. */
  chip: string
  landsAtMs: number | null
  channel: RoutingPlanChannel
}

export type RoutingPlan = {
  sentence: string
  fundedMzn: number
  zarTotal: number
  zarLiquid: number
  mznResidual: number
  rate: number
  liquidPct: number
  legs: RoutingPlanLeg[]
  fullLiquidAtMs: number | null
  fullLiquidLabel: string
  payoutBankTag: string | null
  note: string
  cardZar: number
  eftZar: number
}

function sastParts(ms: number): {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  weekday: number
} {
  const shifted = new Date(ms + SAST_OFFSET_MS)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  }
}

function sastToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): number {
  return Date.UTC(year, month - 1, day, hour, minute, 0) - SAST_OFFSET_MS
}

export function nextLiquidityOpenMs(nowMs: number): number {
  const p = sastParts(nowMs)
  const todayOpen = sastToUtcMs(p.year, p.month, p.day, OPEN_HOUR, OPEN_MINUTE)
  if (nowMs < todayOpen) return todayOpen
  return todayOpen + DAY_MS
}

/** Next Mon–Sat 09:00 SAST strictly after / at the next calendar open. */
export function nextOperatingLiquidityOpenMs(nowMs: number): number {
  let t = nextLiquidityOpenMs(nowMs)
  for (let i = 0; i < 8; i++) {
    if (sastParts(t).weekday !== 0) return t
    t += DAY_MS
  }
  return t
}

/** Next operating-day open after this open (skips Sunday). */
export function nextOperatingOpenAfter(openMs: number): number {
  let t = openMs + DAY_MS
  for (let i = 0; i < 8; i++) {
    if (sastParts(t).weekday !== 0) return t
    t += DAY_MS
  }
  return t
}

export function formatPlanWhenLabel(ms: number): string {
  const p = sastParts(ms)
  const wd = WEEKDAYS[p.weekday] || ''
  const mon = MONTHS[p.month - 1] || ''
  const hh = String(p.hour).padStart(2, '0')
  const mm = String(p.minute).padStart(2, '0')
  return `${wd} ${p.day} ${mon} · ${hh}:${mm}`
}

export function formatPlanByLabel(ms: number): string {
  const p = sastParts(ms)
  const wd = WEEKDAYS[p.weekday] || ''
  const mon = MONTHS[p.month - 1] || ''
  const hh = String(p.hour).padStart(2, '0')
  const mm = String(p.minute).padStart(2, '0')
  return `${wd} ${p.day} ${mon} · by ${hh}:${mm}`
}

function fmtMzn(n: number): string {
  return `${roundMajor(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} MZN`
}

function fmtZar(n: number): string {
  return `R${roundMajor(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export type ProjectedOpenSlice = {
  amountZar: number
  /** 0-based open index from the first projected open. */
  openIndex: number
}

/**
 * Project per-open ZAR slices that clear `amountZar` after FCFS ahead,
 * taking up to dailyCap per open from a refillable reserve pool.
 * (Still used by fund-calculator / open-count helpers.)
 */
export function projectOpenSlices(params: {
  amountZar: number
  dailyCapZar?: number
  reservePoolZar?: number
  queueAheadZar?: number
  firstOpenDailyLeftZar?: number
}): ProjectedOpenSlice[] {
  const amount = roundMajor(Math.max(0, Number(params.amountZar) || 0))
  if (!(amount > 0.005)) return []
  const dailyCap =
    roundMajor(Math.max(0, Number(params.dailyCapZar) || DAILY_LIQUID_ZAR_CAP)) ||
    DAILY_LIQUID_ZAR_CAP
  const reservePool =
    params.reservePoolZar == null || !Number.isFinite(Number(params.reservePoolZar))
      ? dailyCap
      : Math.max(0, Number(params.reservePoolZar))
  const reservePerOpen = reservePool > 0.005 ? reservePool : dailyCap
  let remaining = amount
  let ahead = Math.max(0, Number(params.queueAheadZar) || 0)
  let opens = 0
  let dailyLeft =
    params.firstOpenDailyLeftZar == null
      ? dailyCap
      : Math.max(0, Number(params.firstOpenDailyLeftZar) || 0)
  const maxOpens = 1_000_000
  const slices: ProjectedOpenSlice[] = []
  while (remaining > 0.005 && opens < maxOpens) {
    opens += 1
    let pool = reservePerOpen
    const clearAhead = Math.min(ahead, pool)
    ahead = roundMajor(ahead - clearAhead)
    pool = roundMajor(pool - clearAhead)
    const take = roundMajor(Math.min(remaining, dailyLeft, pool))
    if (take > 0.005) {
      slices.push({ amountZar: take, openIndex: opens - 1 })
      remaining = roundMajor(remaining - take)
    }
    dailyLeft = dailyCap
  }
  return slices
}

/** How many 09:00 opens clear `amountZar` (including queue-clearing days with R0 take). */
export function projectOpenCount(params: {
  amountZar: number
  dailyCapZar?: number
  reservePoolZar?: number
  queueAheadZar?: number
  firstOpenDailyLeftZar?: number
}): number {
  const slices = projectOpenSlices(params)
  if (!slices.length) return 0
  return Math.max(1, slices[slices.length - 1].openIndex + 1)
}

/**
 * Dual-rail pack for residual ZAR:
 * card = planned day targets over the EFT overlap window;
 * eft = remainder, hard-clear T+2.
 */
export function packDualRailResidual(params: {
  residualZar: number
  nowMs: number
  nextOpenAtMs: number
  plannedDayTargetZar?: number
  cardHorizonOperatingDays?: number
  nextOpenBookedZar?: number | null
}): {
  cardLegs: Array<{
    amountZar: number
    landsAtMs: number
    dayIndex: number
    reserved: boolean
  }>
  eftZar: number
  eftAtMs: number
  cardZar: number
} {
  const residual = roundMajor(Math.max(0, Number(params.residualZar) || 0))
  const dayTarget =
    roundMajor(
      Math.max(0, Number(params.plannedDayTargetZar) || PLANNED_CARD_DAY_TARGET_ZAR)
    ) || PLANNED_CARD_DAY_TARGET_ZAR
  const horizon = Math.max(
    1,
    Math.floor(Number(params.cardHorizonOperatingDays) || CARD_EFT_OVERLAP_OPERATING_DAYS)
  )
  const booked = roundMajor(Math.max(0, Number(params.nextOpenBookedZar) || 0))

  const cardLegs: Array<{
    amountZar: number
    landsAtMs: number
    dayIndex: number
    reserved: boolean
  }> = []

  let remaining = residual
  let openAt = params.nextOpenAtMs
  if (sastParts(openAt).weekday === 0) {
    openAt = nextOperatingOpenAfter(openAt - DAY_MS)
  }

  for (let i = 0; i < horizon && remaining > 0.005; i++) {
    const take = roundMajor(Math.min(remaining, dayTarget))
    if (take > 0.005) {
      cardLegs.push({
        amountZar: take,
        landsAtMs: openAt,
        dayIndex: i,
        reserved: i === 0 && booked >= take - 0.005,
      })
      remaining = roundMajor(remaining - take)
    }
    openAt = nextOperatingOpenAfter(openAt)
  }

  const cardZar = roundMajor(cardLegs.reduce((s, l) => s + l.amountZar, 0))
  const eftZar = roundMajor(Math.max(0, residual - cardZar))
  const eftAtMs = Date.parse(
    bankingDeadlineIso(
      params.nowMs,
      EFT_POLICY_V1.hardClearBankingDays,
      EFT_POLICY_V1.hardClearHourSast
    )
  )

  return {
    cardLegs,
    eftZar,
    eftAtMs: Number.isFinite(eftAtMs) ? eftAtMs : params.nowMs + 2 * DAY_MS,
    cardZar,
  }
}

/**
 * Build an over-instant routing plan. Returns null when everything is already liquid
 * (no residual to schedule).
 */
export function assembleRoutingPlan(params: {
  nowMs: number
  fundedMzn: number
  zarLiquid: number
  mznResidual: number
  rate: number
  nextOpenBookedZar?: number | null
  nextOpenAtMs?: number | null
  /** @deprecated reserve/queue no longer size Estimated legs; kept for callers. */
  reservePoolZar?: number | null
  queueAheadZar?: number | null
  /** @deprecated use plannedDayTargetZar */
  dailyCapZar?: number
  plannedDayTargetZar?: number
  cardHorizonOperatingDays?: number
  payoutBankTag?: string | null
}): RoutingPlan | null {
  void params.reservePoolZar
  void params.queueAheadZar
  void params.dailyCapZar

  const rate = Number(params.rate) || 0
  const fundedMzn = roundMajor(Math.max(0, Number(params.fundedMzn) || 0))
  const zarLiquid = roundMajor(Math.max(0, Number(params.zarLiquid) || 0))
  const mznResidual = roundMajor(Math.max(0, Number(params.mznResidual) || 0))
  if (!(fundedMzn > 0.005)) return null
  if (!(mznResidual > 0.005)) return null

  const residualZar = rate > 0 ? roundMajor(mznResidual / rate) : 0
  const zarTotal =
    rate > 0 ? roundMajor(fundedMzn / rate) : roundMajor(zarLiquid + residualZar)
  const liquidPct =
    zarTotal > 0.005
      ? Math.max(0, Math.min(100, Math.round((zarLiquid / zarTotal) * 100)))
      : 0

  const openAt =
    typeof params.nextOpenAtMs === 'number' && params.nextOpenAtMs > 0
      ? params.nextOpenAtMs
      : nextOperatingLiquidityOpenMs(params.nowMs)

  const dayTarget =
    roundMajor(
      Math.max(
        0,
        Number(params.plannedDayTargetZar) ||
          Number(params.dailyCapZar) ||
          PLANNED_CARD_DAY_TARGET_ZAR
      )
    ) || PLANNED_CARD_DAY_TARGET_ZAR

  const packed = packDualRailResidual({
    residualZar,
    nowMs: params.nowMs,
    nextOpenAtMs: openAt,
    plannedDayTargetZar: dayTarget,
    cardHorizonOperatingDays: params.cardHorizonOperatingDays,
    nextOpenBookedZar: params.nextOpenBookedZar,
  })

  const legs: RoutingPlanLeg[] = []

  if (zarLiquid > 0.005) {
    legs.push({
      whenLabel: 'Now',
      subLabel: "rest of today's instant",
      amountZar: zarLiquid,
      confidence: 'now',
      chip: 'Liquid now',
      landsAtMs: null,
      channel: 'instant',
    })
  }

  for (const c of packed.cardLegs) {
    const reserved = c.reserved
    legs.push({
      whenLabel: formatPlanWhenLabel(c.landsAtMs),
      subLabel:
        c.dayIndex === 0
          ? 'card · planned day'
          : `card · day ${c.dayIndex + 1} · parallel`,
      amountZar: c.amountZar,
      confidence: reserved ? 'reserved' : 'estimated',
      chip: reserved ? 'Reserved for you' : 'Card · planned',
      landsAtMs: c.landsAtMs,
      channel: 'card',
    })
  }

  if (packed.eftZar > 0.005) {
    legs.push({
      whenLabel: formatPlanByLabel(packed.eftAtMs),
      subLabel: 'EFT bulk · parallel with card',
      amountZar: packed.eftZar,
      confidence: 'estimated',
      chip: 'EFT · T+2',
      landsAtMs: packed.eftAtMs,
      channel: 'eft',
    })
  }

  // Chronological for the client table — never rail order (card then EFT).
  legs.sort((a, b) => {
    const aMs = a.landsAtMs == null ? 0 : a.landsAtMs
    const bMs = b.landsAtMs == null ? 0 : b.landsAtMs
    if (aMs !== bMs) return aMs - bMs
    return 0
  })

  const landTimes = legs
    .map((l) => l.landsAtMs)
    .filter((t): t is number => typeof t === 'number' && t > 0)
  const fullLiquidAtMs = landTimes.length ? Math.max(...landTimes) : openAt

  const fullLiquidLabel =
    fullLiquidAtMs != null
      ? formatPlanWhenLabel(fullLiquidAtMs).replace(' · ', ' ')
      : '—'

  const sentence =
    zarLiquid > 0.005
      ? `${fmtMzn(fundedMzn)} at Moza Banco. Converting to rand now. ${fmtZar(zarLiquid)} is liquid now. Fully liquid by ${fullLiquidLabel}.`
      : `${fmtMzn(fundedMzn)} at Moza Banco. Converting to rand now. Fully liquid by ${fullLiquidLabel}.`

  const bank = params.payoutBankTag?.trim() || null
  const note = `Each part pays out to your bank as it lands. If a time moves, we'll tell you.`

  return {
    sentence,
    fundedMzn,
    zarTotal,
    zarLiquid,
    mznResidual,
    rate: roundMajor(rate * 10000) / 10000,
    liquidPct,
    legs,
    fullLiquidAtMs,
    fullLiquidLabel,
    payoutBankTag: bank,
    note,
    cardZar: packed.cardZar,
    eftZar: packed.eftZar,
  }
}

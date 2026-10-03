/**
 * Per-ticket swipe times for the restock path (SAST).
 * Sell cards stay day-level ("by COB"); clocks live on Amina's swipe list.
 *
 * Times come from Operating Calendar Rulebook §7.3 (base slots + jitter).
 * The 120-minute floor applies only to the same card or the same POS — adjacent
 * slots under 120 minutes must use different cards and terminals.
 */
import { sastParts, sastToUtcMs, type SastParts } from './routingTime'
import { OPERATING_POLICY_V1 } from '../operatingCalendar/operatingPolicyV1'

/** Minimum gap between consecutive path tickets when same card/POS (policy). */
export const SAME_ACQUIRER_GAP_MS = OPERATING_POLICY_V1.pos.samePosSpacingMinutes * 60 * 1000
/** @deprecated Prefer rulebook slots; kept for tests that assert the 120-minute floor. */
export const CROSS_ACQUIRER_GAP_MS = OPERATING_POLICY_V1.card.sameCardSpacingMinutes * 60 * 1000
export const MIN_ATTEMPT_SPACING_MS = CROSS_ACQUIRER_GAP_MS
export const SAME_ACQUIRER_EXTRA_MS = Math.max(0, SAME_ACQUIRER_GAP_MS - CROSS_ACQUIRER_GAP_MS)
export const OPERATING_HOUR_START = OPERATING_POLICY_V1.timing.operatingHourStart
export const OPERATING_HOUR_END = OPERATING_POLICY_V1.timing.operatingHourEnd
export const OPERATING_MINUTE_END = OPERATING_POLICY_V1.timing.operatingMinuteEnd

/** Rulebook §7.3 base times — minutes from midnight SAST. */
const FOUR_ODD = [9 * 60 + 16, 11 * 60 + 10, 13 * 60 + 19, 15 * 60 + 25]
const FOUR_EVEN = [9 * 60 + 43, 11 * 60 + 43, 13 * 60 + 48, 15 * 60 + 58]
const FIVE_ODD = [9 * 60 + 10, 10 * 60 + 45, 12 * 60 + 20, 13 * 60 + 55, 15 * 60 + 30]
const FIVE_EVEN = [9 * 60 + 39, 11 * 60 + 14, 12 * 60 + 49, 14 * 60 + 24, 15 * 60 + 59]

export type TimedTicket = {
  cardId: number
  machineId: number
  amount: number
  earliestAt: string
  /** Operator clock, e.g. 10h12 */
  timeLabel: string
  pathNote: string | null
}

export type TicketPathSchedule = {
  tickets: TimedTicket[]
  earliestAt: string
  timeLabel: string
  pathSummary: string | null
}

/** 10h12 style — matches the desk language you prefer. */
export function formatDeskClock(ms: number): string {
  const p = sastParts(ms)
  return `${String(p.hour).padStart(2, '0')}h${String(p.minute).padStart(2, '0')}`
}

function addCalendarDays(parts: SastParts, days: number): SastParts {
  const ms = sastToUtcMs(parts.year, parts.month, parts.day, 12, 0) + days * 86_400_000
  return sastParts(ms)
}

/** Next Mon–Sat operating day that still has (or is) the swipe session for `nowMs`. */
export function schedulingDayParts(nowMs: number): SastParts {
  let parts = sastParts(nowMs)
  for (let i = 0; i < 8; i++) {
    if (parts.weekday !== 0) {
      const end = sastToUtcMs(parts.year, parts.month, parts.day, OPERATING_HOUR_END, OPERATING_MINUTE_END)
      // After close, print tomorrow's slots (Sun skipped below).
      if (nowMs <= end || i > 0) return parts
    }
    parts = addCalendarDays(parts, 1)
  }
  return sastParts(nowMs)
}

function baseMinutesForCount(count: number, dayOfMonth: number): number[] {
  const odd = dayOfMonth % 2 === 1
  if (count <= 1) return [odd ? 9 * 60 + 16 : 9 * 60 + 43]
  if (count === 2) return odd ? [9 * 60 + 16, 13 * 60 + 19] : [9 * 60 + 43, 13 * 60 + 48]
  if (count === 3) return odd ? [9 * 60 + 16, 12 * 60 + 20, 15 * 60 + 25] : [9 * 60 + 43, 12 * 60 + 49, 15 * 60 + 58]
  if (count === 4) return odd ? [...FOUR_ODD] : [...FOUR_EVEN]
  return odd ? [...FIVE_ODD] : [...FIVE_EVEN]
}

/** Rulebook §7.3 jitter: ((dayOfMonth * 7 + i * 11) mod 9) - 4 */
export function slotJitterMinutes(dayOfMonth: number, slotIndex: number): number {
  return ((dayOfMonth * 7 + slotIndex * 11) % 9) - 4
}

export function rulebookSlotMinutes(count: number, dayOfMonth: number): number[] {
  const bases = baseMinutesForCount(count, dayOfMonth)
  return bases.map((base, i) => {
    const jittered = base + slotJitterMinutes(dayOfMonth, i)
    const start = OPERATING_HOUR_START * 60
    const end = OPERATING_HOUR_END * 60 + OPERATING_MINUTE_END
    return Math.min(end, Math.max(start, jittered))
  })
}

function minutesToUtcMs(day: SastParts, minutes: number): number {
  const hour = Math.floor(minutes / 60)
  const minute = minutes % 60
  return sastToUtcMs(day.year, day.month, day.day, hour, minute)
}

/**
 * Desk swipe path from the rulebook calendar slots (not a rigid 120-minute ladder).
 * `immediate` is kept for call-site compatibility; clocks stay on the operating day
 * so overnight Continues do not collapse every ticket onto 09h00 / wrap a fifth swipe.
 */
export function scheduleTicketPath(input: {
  assignments: Array<{ cardId: number; machineId: number; amount: number }>
  nowMs?: number
  lastAttemptAtMs?: number | null
  pendingExposureZar?: number
  /** @deprecated Clock override is admin-side; path times stay on the calendar day. */
  immediate?: boolean
}): TicketPathSchedule {
  const nowMs = input.nowMs ?? Date.now()
  const assignments = input.assignments
  if (!assignments.length) {
    const label = formatDeskClock(nowMs)
    return { tickets: [], earliestAt: new Date(nowMs).toISOString(), timeLabel: label, pathSummary: null }
  }

  void input.immediate
  void input.lastAttemptAtMs
  void input.pendingExposureZar

  const day = schedulingDayParts(nowMs)
  const slotMins = rulebookSlotMinutes(assignments.length, day.day)
  // If more tickets than a 5-slot day, extend with 95-minute steps inside hours.
  while (slotMins.length < assignments.length) {
    const last = slotMins[slotMins.length - 1] ?? OPERATING_HOUR_START * 60
    const next = Math.min(OPERATING_HOUR_END * 60 + OPERATING_MINUTE_END, last + 95)
    slotMins.push(next)
  }

  const tickets: TimedTicket[] = []
  const lastByCard = new Map<number, number>()
  const lastByMachine = new Map<number, number>()

  for (let i = 0; i < assignments.length; i++) {
    const row = assignments[i]!
    let at = minutesToUtcMs(day, slotMins[i]!)
    const cardFloor = (lastByCard.get(row.cardId) ?? 0) + SAME_ACQUIRER_GAP_MS
    const posFloor = (lastByMachine.get(row.machineId) ?? 0) + SAME_ACQUIRER_GAP_MS
    const floor = Math.max(cardFloor, posFloor)
    if (floor > at) at = floor

    // Keep the session on one operating day — never wrap a late ticket to another 09h00.
    const dayEnd = sastToUtcMs(day.year, day.month, day.day, OPERATING_HOUR_END, OPERATING_MINUTE_END)
    if (at > dayEnd) at = dayEnd

    tickets.push({
      cardId: row.cardId,
      machineId: row.machineId,
      amount: row.amount,
      earliestAt: new Date(at).toISOString(),
      timeLabel: formatDeskClock(at),
      pathNote: null,
    })
    lastByCard.set(row.cardId, at)
    lastByMachine.set(row.machineId, at)
  }

  return {
    tickets,
    earliestAt: tickets[0]!.earliestAt,
    timeLabel: tickets[0]!.timeLabel,
    pathSummary: null,
  }
}

/** First-slot helper for Sam briefs. */
export function suggestAttemptTime(input: {
  nowMs?: number
  lastAttemptAtMs?: number | null
  pendingExposureZar?: number
}): { earliestAt: string; timeLabel: string; reason: string | null } {
  const path = scheduleTicketPath({
    assignments: [{ cardId: 0, machineId: 0, amount: 0 }],
    nowMs: input.nowMs,
    lastAttemptAtMs: input.lastAttemptAtMs,
    pendingExposureZar: input.pendingExposureZar,
  })
  return {
    earliestAt: path.earliestAt,
    timeLabel: path.timeLabel,
    reason: null,
  }
}

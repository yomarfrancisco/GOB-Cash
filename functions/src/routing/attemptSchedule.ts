/**
 * Per-ticket swipe times for the restock path (SAST).
 * Sell cards stay day-level ("by COB"); clocks live on Amina's swipe list.
 * Spacing and operating hours come from OperatingPolicyV1 — not a shadow policy.
 */
import { sastParts, sastToUtcMs } from './routingTime'
import { railByMachineId } from '../settlement/register'
import { OPERATING_POLICY_V1 } from '../operatingCalendar/operatingPolicyV1'

/** Minimum gap between consecutive path tickets (cross card/POS). */
export const CROSS_ACQUIRER_GAP_MS = OPERATING_POLICY_V1.card.sameCardSpacingMinutes * 60 * 1000
/** Same-card / same-POS / same-acquirer gap — policy floor of 120 minutes. */
export const SAME_ACQUIRER_GAP_MS = OPERATING_POLICY_V1.pos.samePosSpacingMinutes * 60 * 1000
export const MIN_ATTEMPT_SPACING_MS = CROSS_ACQUIRER_GAP_MS
export const SAME_ACQUIRER_EXTRA_MS = Math.max(0, SAME_ACQUIRER_GAP_MS - CROSS_ACQUIRER_GAP_MS)
export const OPERATING_HOUR_START = OPERATING_POLICY_V1.timing.operatingHourStart
export const OPERATING_HOUR_END = OPERATING_POLICY_V1.timing.operatingHourEnd
export const OPERATING_MINUTE_END = OPERATING_POLICY_V1.timing.operatingMinuteEnd

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

function roundToFiveMinutes(ms: number): number {
  const p = sastParts(ms)
  const m = Math.ceil(p.minute / 5) * 5
  if (m >= 60) return sastToUtcMs(p.year, p.month, p.day, p.hour + 1, 0)
  return sastToUtcMs(p.year, p.month, p.day, p.hour, m)
}

function clampOperating(ms: number): number {
  const p = sastParts(ms)
  const start = sastToUtcMs(p.year, p.month, p.day, OPERATING_HOUR_START, 0)
  const end = sastToUtcMs(p.year, p.month, p.day, OPERATING_HOUR_END, OPERATING_MINUTE_END)
  if (ms < start) return start
  if (ms > end) {
    const next = new Date(ms + 86_400_000)
    const n = sastParts(next.getTime())
    return sastToUtcMs(n.year, n.month, n.day, OPERATING_HOUR_START, 0)
  }
  return ms
}

function acquirerOf(machineId: number): string {
  return railByMachineId(machineId)?.acquirer || `pos_${machineId}`
}

/**
 * Morning-first swipe path: tight gaps across acquirers, longer when the same acquirer repeats.
 */
export function scheduleTicketPath(input: {
  assignments: Array<{ cardId: number; machineId: number; amount: number }>
  nowMs?: number
  lastAttemptAtMs?: number | null
  pendingExposureZar?: number
  /** Admin / capital-shock reissue: first swipe is now, not spaced into the afternoon. */
  immediate?: boolean
}): TicketPathSchedule {
  const nowMs = input.nowMs ?? Date.now()
  const assignments = input.assignments
  if (!assignments.length) {
    const label = formatDeskClock(nowMs)
    return { tickets: [], earliestAt: new Date(nowMs).toISOString(), timeLabel: label, pathSummary: null }
  }

  let cursor: number
  if (input.immediate) {
    cursor = nowMs
  } else {
    // Prefer a mid-morning start for the restock path when the day is open.
    const parts = sastParts(nowMs)
    cursor = sastToUtcMs(parts.year, parts.month, parts.day, 10, 12)
    if (nowMs > cursor) cursor = nowMs
    if (input.lastAttemptAtMs != null && input.lastAttemptAtMs > 0) {
      cursor = Math.max(cursor, input.lastAttemptAtMs + CROSS_ACQUIRER_GAP_MS)
    }
    if ((input.pendingExposureZar || 0) > 0) {
      cursor = Math.max(cursor, nowMs + CROSS_ACQUIRER_GAP_MS)
    }
  }

  const tickets: TimedTicket[] = []
  let prevAcquirer: string | null = null

  for (let i = 0; i < assignments.length; i++) {
    const row = assignments[i]
    const acquirer = acquirerOf(row.machineId)
    if (i === 0) {
      cursor = clampOperating(roundToFiveMinutes(cursor))
    } else {
      const same = prevAcquirer != null && prevAcquirer === acquirer
      const gap = same ? SAME_ACQUIRER_GAP_MS : CROSS_ACQUIRER_GAP_MS
      cursor = clampOperating(roundToFiveMinutes(cursor + gap))
    }
    tickets.push({
      cardId: row.cardId,
      machineId: row.machineId,
      amount: row.amount,
      earliestAt: new Date(cursor).toISOString(),
      timeLabel: formatDeskClock(cursor),
      pathNote: null,
    })
    prevAcquirer = acquirer
  }

  return {
    tickets,
    earliestAt: tickets[0].earliestAt,
    timeLabel: tickets[0].timeLabel,
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

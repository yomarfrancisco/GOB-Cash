/**
 * Per-ticket attempt times for the day's path (SAST).
 * Business hours only clamp; they are not the operator-facing reason.
 */
import { sastParts, sastToUtcMs } from './routingTime'
import { railByMachineId } from '../settlement/register'

export const MIN_ATTEMPT_SPACING_MS = 2 * 60 * 60 * 1000
/** Extra gap when consecutive tickets share an acquirer. */
export const SAME_ACQUIRER_EXTRA_MS = 30 * 60 * 1000
export const OPERATING_HOUR_START = 9
export const OPERATING_HOUR_END = 16
export const OPERATING_MINUTE_END = 30

export type TimedTicket = {
  cardId: number
  machineId: number
  amount: number
  earliestAt: string
  timeLabel: string
  /** Short path note for this slot only (optional). */
  pathNote: string | null
}

export type TicketPathSchedule = {
  tickets: TimedTicket[]
  /** First ticket clock — for event metadata. */
  earliestAt: string
  timeLabel: string
  /** One-line path summary, never “business hours” boilerplate. */
  pathSummary: string | null
}

function formatHhmm(ms: number): string {
  const p = sastParts(ms)
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}

function roundToQuarterHour(ms: number): number {
  const p = sastParts(ms)
  const q = Math.ceil(p.minute / 15) * 15
  if (q >= 60) return sastToUtcMs(p.year, p.month, p.day, p.hour + 1, 0)
  return sastToUtcMs(p.year, p.month, p.day, p.hour, q)
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
 * Assign a concrete SAST time to each ticket in path order.
 * Spacing + same-acquirer extra gap; hours only as a silent clamp.
 */
export function scheduleTicketPath(input: {
  assignments: Array<{ cardId: number; machineId: number; amount: number }>
  nowMs?: number
  lastAttemptAtMs?: number | null
  pendingExposureZar?: number
}): TicketPathSchedule {
  const nowMs = input.nowMs ?? Date.now()
  const assignments = input.assignments
  if (!assignments.length) {
    return { tickets: [], earliestAt: new Date(nowMs).toISOString(), timeLabel: formatHhmm(nowMs), pathSummary: null }
  }

  let cursor = nowMs
  if (input.lastAttemptAtMs != null && input.lastAttemptAtMs > 0) {
    cursor = Math.max(cursor, input.lastAttemptAtMs + MIN_ATTEMPT_SPACING_MS)
  }
  // Pending earlier sales: start the restock/sale path after a full spacing from now.
  if ((input.pendingExposureZar || 0) > 0) {
    cursor = Math.max(cursor, nowMs + MIN_ATTEMPT_SPACING_MS)
  }

  const tickets: TimedTicket[] = []
  let prevAcquirer: string | null = null
  let sameAcquirerPairs = 0

  for (let i = 0; i < assignments.length; i++) {
    const row = assignments[i]
    const acquirer = acquirerOf(row.machineId)
    let pathNote: string | null = null

    if (i === 0) {
      cursor = clampOperating(roundToQuarterHour(cursor))
      if ((input.pendingExposureZar || 0) > 0) {
        pathNote = 'after pending usable ZAR clears'
      }
    } else {
      let gap = MIN_ATTEMPT_SPACING_MS
      if (prevAcquirer && prevAcquirer === acquirer) {
        gap += SAME_ACQUIRER_EXTRA_MS
        sameAcquirerPairs += 1
        pathNote = `extra gap — same acquirer as previous ticket`
      }
      cursor = clampOperating(roundToQuarterHour(cursor + gap))
    }

    const label = formatHhmm(cursor)
    tickets.push({
      cardId: row.cardId,
      machineId: row.machineId,
      amount: row.amount,
      earliestAt: new Date(cursor).toISOString(),
      timeLabel: label,
      pathNote,
    })
    prevAcquirer = acquirer
  }

  const pathSummary =
    tickets.length <= 1
      ? tickets[0]?.pathNote
        ? `Start ${tickets[0].timeLabel} — ${tickets[0].pathNote}.`
        : null
      : sameAcquirerPairs > 0
        ? `Path times spaced ~2h; longer where the same acquirer repeats.`
        : `Path times spaced ~2h across rails.`

  return {
    tickets,
    earliestAt: tickets[0].earliestAt,
    timeLabel: tickets[0].timeLabel,
    pathSummary,
  }
}

/** @deprecated Prefer scheduleTicketPath — kept for Sam brief first-slot only. */
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
    reason: path.pathSummary,
  }
}

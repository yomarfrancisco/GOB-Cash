/**
 * Earliest-attempt suggestions for desk instructions (SAST).
 * Guidance only — Confirm process unchanged.
 */
import { sastParts, sastToUtcMs } from '../routing/routingTime'

export const MIN_ATTEMPT_SPACING_MS = 2 * 60 * 60 * 1000
export const OPERATING_HOUR_START = 9
export const OPERATING_HOUR_END = 16
export const OPERATING_MINUTE_END = 30

export type AttemptSchedule = {
  earliestAt: string
  timeLabel: string
  reason: string | null
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

function clampOperating(ms: number): { at: number; deferred: boolean } {
  const p = sastParts(ms)
  const start = sastToUtcMs(p.year, p.month, p.day, OPERATING_HOUR_START, 0)
  const end = sastToUtcMs(p.year, p.month, p.day, OPERATING_HOUR_END, OPERATING_MINUTE_END)
  if (ms < start) return { at: start, deferred: true }
  if (ms > end) {
    const next = new Date(ms + 86_400_000)
    const n = sastParts(next.getTime())
    return { at: sastToUtcMs(n.year, n.month, n.day, OPERATING_HOUR_START, 0), deferred: true }
  }
  return { at: ms, deferred: false }
}

export function suggestAttemptTime(input: {
  nowMs?: number
  lastAttemptAtMs?: number | null
  pendingExposureZar?: number
}): AttemptSchedule {
  const nowMs = input.nowMs ?? Date.now()
  const reasons: string[] = []
  let earliest = nowMs

  if (input.lastAttemptAtMs != null && input.lastAttemptAtMs > 0) {
    const spaced = input.lastAttemptAtMs + MIN_ATTEMPT_SPACING_MS
    if (spaced > earliest) {
      earliest = spaced
      reasons.push('keeping a two-hour gap after the last attempt')
    }
  }
  if ((input.pendingExposureZar || 0) > 0) {
    reasons.push('earlier tickets are still pending usable ZAR')
  }

  const clamped = clampOperating(roundToQuarterHour(earliest))
  if (clamped.deferred) reasons.push('inside business hours (09:00–16:30 SAST)')

  const at = clamped.at
  const label = formatHhmm(at)
  const reason =
    reasons.length === 0
      ? null
      : reasons.length === 1
        ? `Not before ${label} SAST — ${reasons[0]}.`
        : `Not before ${label} SAST — ${reasons.slice(0, -1).join('; ')}; and ${reasons[reasons.length - 1]}.`

  return {
    earliestAt: new Date(at).toISOString(),
    timeLabel: label,
    reason,
  }
}

export function scheduleLine(schedule: AttemptSchedule): string {
  if (schedule.reason) return schedule.reason
  return `Earliest attempt: ${schedule.timeLabel} SAST.`
}

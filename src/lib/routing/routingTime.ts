/**
 * Clock and calendar helpers for conversion-routing interpretation.
 * Planner cycles still advance only on Execute. These helpers resolve
 * human time phrases into SAST instants the overlay can expire against.
 */

export const ROUTING_TIMEZONE = 'Africa/Johannesburg'
export const SAST_OFFSET_MS = 2 * 60 * 60 * 1000

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
}

const CALENDAR_RE =
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|yesterday|tonight|lunch|noon|midnight|weekend)\b|\b(this|next)\s+(morning|afternoon|evening|week|month)\b|\brest of (the )?(day|today|week)\b|\b\d{1,2}:\d{2}\b|\b\d{1,2}\s*(am|pm)\b|\b\d{1,2}\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i

export type SastParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  weekday: number
}

export type RoutingClock = {
  nowMs: number
  timezone: string
  weekday: string
  dateLabel: string
  timeLabel: string
  promptLine: string
}

export function sastParts(nowMs: number): SastParts {
  const shifted = new Date(nowMs + SAST_OFFSET_MS)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    weekday: shifted.getUTCDay(),
  }
}

export function sastToUtcMs(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0
): number {
  return Date.UTC(year, month - 1, day, hour, minute, second) - SAST_OFFSET_MS
}

export function formatSast(ms: number): string {
  const p = sastParts(ms)
  const hh = String(p.hour).padStart(2, '0')
  const mm = String(p.minute).padStart(2, '0')
  return `${WEEKDAYS[p.weekday]} ${p.day} ${MONTHS[p.month - 1]} ${p.year}, ${hh}:${mm} SAST`
}

export function formatVisibleSast(ms: number, nowMs = Date.now()): string {
  const p = sastParts(ms)
  const n = sastParts(nowMs)
  const hhmm = `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
  if (p.year === n.year && p.month === n.month && p.day === n.day) return hhmm
  const yesterday = sastParts(nowMs - 86_400_000)
  if (p.year === yesterday.year && p.month === yesterday.month && p.day === yesterday.day) {
    return `Yesterday ${hhmm}`
  }
  return `${p.day} ${MONTHS[p.month - 1].slice(0, 3)} ${hhmm}`
}

export function formatRoutingClock(nowMs: number): RoutingClock {
  const p = sastParts(nowMs)
  const hh = String(p.hour).padStart(2, '0')
  const mm = String(p.minute).padStart(2, '0')
  const weekday = WEEKDAYS[p.weekday]
  const dateLabel = `${weekday} ${p.day} ${MONTHS[p.month - 1]} ${p.year}`
  const timeLabel = `${hh}:${mm}`
  return {
    nowMs,
    timezone: ROUTING_TIMEZONE,
    weekday,
    dateLabel,
    timeLabel,
    promptLine: `Now: ${dateLabel}, ${timeLabel} SAST (${ROUTING_TIMEZONE}). Unix ms: ${nowMs}.`,
  }
}

export function parseExpiresAt(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return Math.round(raw)
  if (typeof raw === 'string' && raw.trim()) {
    const trimmed = raw.trim()
    const asNumber = Number(trimmed)
    if (Number.isFinite(asNumber) && asNumber > 1_000_000_000_000) return Math.round(asNumber)
    const parsed = Date.parse(trimmed)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function stripManualUntil(message: string): string {
  return message.replace(/\buntil (i |you )?(say|tell|restore)\b/gi, ' ')
}

export function hasCalendarTimeReference(message: string): boolean {
  return CALENDAR_RE.test(stripManualUntil(message))
}

export function hasFutureTimeConstraint(message: string): boolean {
  const text = stripManualUntil(message)
  return /\b(until|by|before|for the rest)\b/i.test(text) && hasCalendarTimeReference(text)
}

export function isMemoryOrHistoryQuestion(message: string): boolean {
  const text = message.trim().toLowerCase()
  if (!text) return false
  if (hasFutureTimeConstraint(message)) return false
  const namesAChange =
    /\b(unavailable|blocked|don'?t use|do not use|restore|cap|limit|prefer|resting|exclude)\b/.test(text) &&
    /\b(?:card|machine|c|m)\s*\d+/.test(text)
  if (namesAChange) return false
  return /\b(remember|recall|remind|when|what time|how long|which day|did we|did i|did you|last used|already|told you|you know|was it|still lost|expect)\b/.test(
    text
  )
}

export function isWhatIfAsk(message: string): boolean {
  const text = message.trim().toLowerCase()
  return (
    /\bwhat if\b/.test(text) ||
    /\bwhat would happen\b/.test(text) ||
    /\bwould happen if\b/.test(text) ||
    /\bsuppose we\b/.test(text) ||
    /\blet'?s say we\b/.test(text) ||
    /\bif we (?:rest|exclude|drop|lost|lose|skip|cap|capped|follow|followed|used)\b/.test(text)
  )
}

export function isBankerQuestion(message: string): boolean {
  if (isWhatIfAsk(message)) return false
  if (isMemoryOrHistoryQuestion(message)) return true
  const text = message.trim().toLowerCase()
  if (!text) return false
  if (
    /\b(unavailable|blocked|don'?t use|do not use|restore|cap|limit|prefer|exclude|lost|down|resting)\b/.test(text) ||
    /\brest\b/.test(text)
  ) {
    return false
  }
  return (
    /^(why|how|explain|tell me|what happens|is this|should we|does this|can you explain)\b/.test(text) ||
    (text.includes('?') && /^(why|how|what|who|when|where|is |are |should|does|do |can |could |would )\b/.test(text))
  )
}

export function namesConstraintChange(message: string): boolean {
  const text = message.trim().toLowerCase()
  return (
    /\b(unavailable|blocked|don'?t use|do not use|restore|cap|limit|prefer|exclude|lost|down|resting)\b/.test(text) ||
    /\brest\b/.test(text)
  )
}

export function isDeskStrategyAsk(message: string): boolean {
  if (isWhatIfAsk(message)) return false
  if (namesConstraintChange(message)) return false
  const text = message.trim().toLowerCase()
  if (!text) return false
  return (
    /\bwhat'?s next\b/.test(text) ||
    /\bwhat is next\b/.test(text) ||
    /\bwhat now\b/.test(text) ||
    /\bwhat (?:do we|should we|can we) do\b/.test(text) ||
    /\bhow do we (?:continue|proceed|keep going)\b/.test(text) ||
    /\bbest (?:option|route|move|advice)\b/.test(text) ||
    /\badvise (?:me|us)\b/.test(text) ||
    /\blet'?s assume\b/.test(text) ||
    /\bwhat happens if\b/.test(text) ||
    /^(?:ok|okay|alright)[,.]?\s*(?:what'?s next|what now|what do we do)/.test(text)
  )
}

export function shouldNotApplyAskIntents(message: string): boolean {
  return isBankerQuestion(message) || isDeskStrategyAsk(message)
}

function parseClockTime(lower: string): { hour: number; minute: number } | null {
  const colon = lower.match(/\b(\d{1,2}):(\d{2})\b/)
  if (colon) {
    const hour = Number(colon[1])
    const minute = Number(colon[2])
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) return { hour, minute }
  }
  const meridiem = lower.match(/\b(\d{1,2})\s*(am|pm)\b/)
  if (meridiem) {
    let hour = Number(meridiem[1])
    if (hour < 1 || hour > 12) return null
    if (meridiem[2] === 'am') hour = hour === 12 ? 0 : hour
    else hour = hour === 12 ? 12 : hour + 12
    return { hour, minute: 0 }
  }
  return null
}

function impliedHour(lower: string, parsed: { hour: number; minute: number } | null): {
  hour: number
  minute: number
} {
  if (parsed) return parsed
  if (/\b(evening|tonight|night)\b/.test(lower)) return { hour: 18, minute: 0 }
  if (/\bmorning\b/.test(lower)) return { hour: 9, minute: 0 }
  if (/\bafternoon\b/.test(lower)) return { hour: 13, minute: 0 }
  if (/\bnoon\b/.test(lower)) return { hour: 12, minute: 0 }
  if (/\bmidnight\b/.test(lower)) return { hour: 0, minute: 0 }
  return { hour: 0, minute: 0 }
}

function nextWeekdayMs(
  nowMs: number,
  targetDow: number,
  hour: number,
  minute: number
): number {
  const p = sastParts(nowMs)
  const delta = (targetDow - p.weekday + 7) % 7
  let ms = sastToUtcMs(p.year, p.month, p.day + delta, hour, minute)
  if (ms <= nowMs) ms = sastToUtcMs(p.year, p.month, p.day + delta + 7, hour, minute)
  return ms
}

function laterTodayOrTomorrow(
  nowMs: number,
  hour: number,
  minute: number
): number {
  const p = sastParts(nowMs)
  let ms = sastToUtcMs(p.year, p.month, p.day, hour, minute)
  if (ms <= nowMs) ms = sastToUtcMs(p.year, p.month, p.day + 1, hour, minute)
  return ms
}

export function resolveExpiryFromMessage(message: string, nowMs: number): number | null {
  if (!hasFutureTimeConstraint(message)) return null
  const lower = stripManualUntil(message).toLowerCase()
  const clock = parseClockTime(lower)
  const at = impliedHour(lower, clock)

  if (/\brest of (the )?(day|today)\b/.test(lower) || /\bfor the rest of today\b/.test(lower)) {
    const p = sastParts(nowMs)
    return sastToUtcMs(p.year, p.month, p.day + 1, 0, 0)
  }

  if (/\buntil tonight\b|\bby tonight\b/.test(lower)) {
    return laterTodayOrTomorrow(nowMs, 23, 59)
  }

  if (/\blunch\b/.test(lower) && !clock) {
    return laterTodayOrTomorrow(nowMs, 13, 0)
  }

  const weekday = lower.match(
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/
  )
  if (weekday) {
    return nextWeekdayMs(nowMs, WEEKDAY_INDEX[weekday[1]], at.hour, at.minute)
  }

  if (/\bweekend\b/.test(lower)) {
    return nextWeekdayMs(nowMs, 6, 0, 0)
  }

  if (/\bnext week\b/.test(lower)) {
    return nextWeekdayMs(nowMs, 1, 0, 0)
  }

  if (/\btomorrow\b/.test(lower)) {
    const p = sastParts(nowMs)
    return sastToUtcMs(p.year, p.month, p.day + 1, at.hour, at.minute)
  }

  if (clock) {
    return laterTodayOrTomorrow(nowMs, clock.hour, clock.minute)
  }

  if (/\btoday\b/.test(lower)) {
    const p = sastParts(nowMs)
    return sastToUtcMs(p.year, p.month, p.day + 1, 0, 0)
  }

  return null
}

export function firestoreTimestampMs(value: unknown): number | null {
  if (value == null) return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'object') {
    const row = value as { toMillis?: () => number; seconds?: number }
    if (typeof row.toMillis === 'function') {
      const ms = row.toMillis()
      return Number.isFinite(ms) ? ms : null
    }
    if (typeof row.seconds === 'number' && Number.isFinite(row.seconds)) {
      return Math.round(row.seconds * 1000)
    }
  }
  return null
}

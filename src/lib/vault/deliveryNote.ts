/**
 * Earn delivery note — 09:00–09:00 cycle with 15:00 cut-off (Part 19 update).
 * All schedule/rate/calendar knobs live here; UI must not hard-code them.
 */
import { sellMznPerUsd } from '@/lib/mznZar'
import { sastParts, sastToUtcMs } from '@/lib/routing/routingTime'
import type { VaultPosition } from '@/store/vault'

export const DELIVERY_NOTE = {
  openTime: { hour: 9, minute: 0 },
  /** USDC returned at this SAST clock on the cycle's return morning. */
  returnTime: { hour: 9, minute: 0 },
  /** After this SAST clock, funding joins the next cycle at preorderRate. */
  cutoffTime: { hour: 15, minute: 0 },
  openRatePct: 6.5,
  stepDownPct: 0.25,
  stepEveryMinutes: 60,
  /** Flat rate from cut-off until the next cycle opens. */
  preorderRatePct: 6.0,
  /**
   * ISO dates `YYYY-MM-DD` (SAST calendar) that behave like Sunday.
   * Empty until a holiday feed is wired — see unmatched notes.
   */
  publicHolidays: [] as readonly string[],
} as const

export type DeliveryNotePhase = 'open' | 'preorder' | 'funded' | 'settled' | 'late'

export type DeliveryNoteView = {
  phase: DeliveryNotePhase
  liveRatePct: number
  lockedRatePct: number | null
  displayRatePct: number
  rateLabel: string
  cardSub: string
  title: string
  sentence: string
  panelLabel: string
  pill: string
  pillTone: 'ok' | 'late' | 'open' | 'closed' | 'preorder'
  panelBig: string
  barPct: number
  metaLeft: string
  metaRight: string
  nextStepRatePct: number | null
  nextStepAtMs: number | null
  returnAtMs: number
  openAtMs: number
  cutoffAtMs: number
  supplyEnabled: boolean
  supplyLabel: string
  zarBackLabel: string
  usdcFrontMajor: number
  showBreakdown: boolean
  breakdown?: {
    supplied: number
    used: number
    usedPct: number
    earned: number
    lockedRatePct: number
    backInWallet: number
  }
  showSolscan: boolean
}

type Ymd = { year: number; month: number; day: number }

const WD_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export function formatNoteRate(pct: number): string {
  if (!Number.isFinite(pct)) return '[x]'
  const n = Math.round(pct * 100) / 100
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, '').replace(/\.$/, '')
}

export function formatCountdownHms(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function ymdFromParts(p: { year: number; month: number; day: number }): Ymd {
  return { year: p.year, month: p.month, day: p.day }
}

function ymdKey(d: Ymd): string {
  return `${d.year}-${pad2(d.month)}-${pad2(d.day)}`
}

function addCalendarDays(d: Ymd, days: number): Ymd {
  const utc = Date.UTC(d.year, d.month - 1, d.day) + days * 24 * 3600 * 1000
  const x = new Date(utc)
  return { year: x.getUTCFullYear(), month: x.getUTCMonth() + 1, day: x.getUTCDate() }
}

function weekdayOf(d: Ymd): number {
  return new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay()
}

/** Sunday or configured public holiday (SAST calendar day). */
export function isNoteRestDay(d: Ymd): boolean {
  if (weekdayOf(d) === 0) return true
  return DELIVERY_NOTE.publicHolidays.includes(ymdKey(d))
}

function atSastMs(d: Ymd, hour: number, minute: number): number {
  return sastToUtcMs(d.year, d.month, d.day, hour, minute)
}

function openMsOn(d: Ymd): number {
  return atSastMs(d, DELIVERY_NOTE.openTime.hour, DELIVERY_NOTE.openTime.minute)
}

function cutoffMsOn(d: Ymd): number {
  return atSastMs(d, DELIVERY_NOTE.cutoffTime.hour, DELIVERY_NOTE.cutoffTime.minute)
}

function returnMsOn(d: Ymd): number {
  return atSastMs(d, DELIVERY_NOTE.returnTime.hour, DELIVERY_NOTE.returnTime.minute)
}

/**
 * Cycle day a funding at `atMs` joins.
 * Return is always 09:00 SAST on the calendar day after that cycle day.
 */
export function noteCycleDayForFunding(atMs: number): Ymd {
  const p = sastParts(atMs)
  const today = ymdFromParts(p)
  const afterCutoff =
    p.hour > DELIVERY_NOTE.cutoffTime.hour ||
    (p.hour === DELIVERY_NOTE.cutoffTime.hour && p.minute >= DELIVERY_NOTE.cutoffTime.minute)

  // Sat after 15:00 and all of Sunday (and holidays) → that rest-day cycle.
  if (isNoteRestDay(today)) return today

  if (afterCutoff) {
    return addCalendarDays(today, 1)
  }

  // Before open still joins today's cycle (pre-order into the morning open).
  return today
}

/** Return instant for a funding at `atMs` (09:00 after the joined cycle day). */
export function noteReturnAtMs(atMs: number): number {
  const cycleDay = noteCycleDayForFunding(atMs)
  return returnMsOn(addCalendarDays(cycleDay, 1))
}

/** Open / cut-off of the cycle a funding at `atMs` joins. */
export function noteCycleWindow(atMs: number): {
  cycleDay: Ymd
  openAtMs: number
  cutoffAtMs: number
  returnAtMs: number
} {
  const cycleDay = noteCycleDayForFunding(atMs)
  return {
    cycleDay,
    openAtMs: openMsOn(cycleDay),
    cutoffAtMs: cutoffMsOn(cycleDay),
    returnAtMs: returnMsOn(addCalendarDays(cycleDay, 1)),
  }
}

/** Absolute return clock for prose: "09:00 SAST (07:00 GMT)". */
export function formatReturnAbsolute(returnAtMs?: number): string {
  const h = returnAtMs != null ? sastParts(returnAtMs).hour : DELIVERY_NOTE.returnTime.hour
  const m = returnAtMs != null ? sastParts(returnAtMs).minute : DELIVERY_NOTE.returnTime.minute
  const gmtH = (h - 2 + 24) % 24
  return `${pad2(h)}:${pad2(m)} SAST (${pad2(gmtH)}:${pad2(m)} GMT)`
}

/** Card sub fragment: "back Fri 09:00". */
export function formatBackByShort(ms: number): string {
  const p = sastParts(ms)
  return `back ${WD_SHORT[p.weekday]} ${pad2(p.hour)}:${pad2(p.minute)}`
}

/** Card sub: relative "back in 23 hours" from now → return. */
export function formatBackInRough(msUntil: number): string {
  const totalMin = Math.max(0, Math.round(msUntil / 60_000))
  if (totalMin < 1) return 'back soon'
  if (totalMin < 60) return `back in ${totalMin} min`
  const hours = Math.round(totalMin / 60)
  if (hours === 1) return 'back in 1 hour'
  if (hours < 48) return `back in ${hours} hours`
  const days = Math.round(hours / 24)
  return days === 1 ? 'back in 1 day' : `back in ${days} days`
}

export function noteOpenAtMs(nowMs: number): number {
  return noteCycleWindow(nowMs).openAtMs
}

export function noteCutoffAtMs(nowMs: number): number {
  return noteCycleWindow(nowMs).cutoffAtMs
}

/** Live supplier rate at `atMs` (locked when deposit lands). */
export function liveNoteRatePct(atMs: number): number {
  const p = sastParts(atMs)
  const day = ymdFromParts(p)
  const open = openMsOn(day)
  const cutoff = cutoffMsOn(day)
  if (atMs >= open && atMs < cutoff) {
    const steps = Math.floor((atMs - open) / (DELIVERY_NOTE.stepEveryMinutes * 60_000))
    const rate = DELIVERY_NOTE.openRatePct - steps * DELIVERY_NOTE.stepDownPct
    return Math.round(rate * 100) / 100
  }
  return DELIVERY_NOTE.preorderRatePct
}

export function nextStepAtMs(nowMs: number): number | null {
  const p = sastParts(nowMs)
  const day = ymdFromParts(p)
  const open = openMsOn(day)
  const cutoff = cutoffMsOn(day)
  if (nowMs >= open && nowMs < cutoff) {
    const stepMs = DELIVERY_NOTE.stepEveryMinutes * 60_000
    const next = open + (Math.floor((nowMs - open) / stepMs) + 1) * stepMs
    if (next >= cutoff) return null
    return next
  }
  // Pre-order / after cut-off: next event is the cycle open we are joining.
  const { openAtMs } = noteCycleWindow(nowMs)
  if (nowMs < openAtMs) return openAtMs
  return null
}

function formatWhenShort(ms: number): string {
  const p = sastParts(ms)
  return `${WD_SHORT[p.weekday]} ${pad2(p.hour)}:${pad2(p.minute)}`
}

function formatReturnLabel(ms: number): string {
  const p = sastParts(ms)
  return `BACK BY ${WD_SHORT[p.weekday].toUpperCase()} ${pad2(p.hour)}:${pad2(p.minute)} SAST`
}

function formatWdLong(d: Ymd): string {
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  return names[weekdayOf(d)] || 'tomorrow'
}

function usedUsdc(position: VaultPosition): number {
  const used = Number(position.usedUsdc)
  if (Number.isFinite(used) && used >= 0) return used
  return Math.max(0, Number(position.committedUsdc) || 0)
}

/** Max return if the full supply is used for deliveries (USD, 2dp — desk/copy). */
function maxEarnUsd(supplied: number, ratePct: number): number {
  return Math.round(supplied * (ratePct / 100) * 100) / 100
}

/** Full-precision USD earn — do not cent-round before converting to MZN. */
function noteEarnUsdRaw(position: VaultPosition, nowMs = Date.now()): number {
  const supplied = Math.max(0, Number(position.suppliedUsdc) || 0)
  if (!(supplied > 0.005)) return 0
  const locked = position.lockedRatePct
  const rate =
    typeof locked === 'number' && Number.isFinite(locked) && locked > 0
      ? locked
      : liveNoteRatePct(nowMs)
  const computed = supplied * (rate / 100)
  const stored = Math.max(0, Number(position.expectedEarnedUsd) || 0)
  // Server expectedEarnedUsd is 2dp — dust supplies store 0; fall back to raw.
  return stored > 0 ? stored : computed
}

/**
 * Home pill: "6.25% in 24h" — locked rate if funded, else live note rate.
 */
export function homeEarnPill(position: VaultPosition, nowMs = Date.now()): {
  strong: string
  label: string
} {
  const locked = position.lockedRatePct
  const rate =
    typeof locked === 'number' && Number.isFinite(locked) && locked > 0
      ? locked
      : liveNoteRatePct(nowMs)
  return { strong: `${formatNoteRate(rate)}%`, label: 'in 24h' }
}

/** Full-precision USD earn for the Earn card major (may be dust ≪ $0.01). */
export function homeEarnExpectedUsdRaw(position: VaultPosition, nowMs = Date.now()): number {
  return noteEarnUsdRaw(position, nowMs)
}

/** USD return at the locked (or live) note premium — cents for desk/copy. */
export function homeEarnExpectedUsd(position: VaultPosition, nowMs = Date.now()): number {
  return Math.round(noteEarnUsdRaw(position, nowMs) * 100) / 100
}

/**
 * Home Earn minor: MZN value of the note premium (SELL Mt/$ × expected USD earn).
 * Converts at full USD precision so dust supplies still show MZN cents.
 * `sellMznQuote` / `usdPerZarQuote` are `/api/fx/latest` raws.
 */
export function homeEarnExpectedMzn(
  position: VaultPosition,
  sellMznQuote: number,
  usdPerZarQuote: number,
  nowMs = Date.now()
): number {
  const usd = noteEarnUsdRaw(position, nowMs)
  if (!(usd > 0)) return 0
  const mtPerUsd = sellMznPerUsd(sellMznQuote, usdPerZarQuote)
  if (!(mtPerUsd > 0)) return 0
  // Full precision — Earn minor formatter decides 2dp vs dust decimals.
  return usd * mtPerUsd
}

/** Share of supply currently in use (home + funded card bar). */
export function noteInUseShare(position: VaultPosition): number {
  const supplied = Number(position.suppliedUsdc) || 0
  if (!(supplied > 0.005)) return 0
  return Math.max(0, Math.min(1, usedUsdc(position) / supplied))
}

export function deriveDeliveryNoteView(
  position: VaultPosition,
  nowMs = Date.now()
): DeliveryNoteView {
  const cycle = noteCycleWindow(nowMs)
  const { openAtMs: openAt, cutoffAtMs: cutoffAt, returnAtMs: returnAt, cycleDay } = cycle
  const live = liveNoteRatePct(nowMs)
  const nextAt = nextStepAtMs(nowMs)
  const nextRate = nextAt != null ? liveNoteRatePct(nextAt) : null

  const supplied = Number(position.suppliedUsdc) || 0
  const hasSupply = supplied > 0.005
  const lockAt = position.suppliedAtMs || position.lastSupply?.atMs || nowMs
  const locked =
    typeof position.lockedRatePct === 'number' && Number.isFinite(position.lockedRatePct)
      ? position.lockedRatePct
      : hasSupply
        ? liveNoteRatePct(lockAt)
        : null
  const used = usedUsdc(position)
  const zarFunded = Math.max(0, Number(position.zarFunded) || Number(position.zarEarned) || 0)
  const settled =
    position.notePhase === 'settled' ||
    (typeof position.returnedUsdc === 'number' && position.returnedUsdc > 0.005)
  const lateFlag = position.notePhase === 'late'

  const inStepWindow = nowMs >= openAt && nowMs < cutoffAt
  const pastReturn = nowMs >= returnAt
  const backBy = formatBackByShort(returnAt)

  // Settled
  if (settled && hasSupply) {
    const returned = Number(position.returnedUsdc) || supplied + (Number(position.earnedUsdToday) || 0)
    const rate = locked ?? live
    const usedPct = Math.round((used / supplied) * 100)
    const unusedPct = Math.max(0, 100 - usedPct)
    const earned =
      Number(position.earnedUsdToday) ||
      Math.round(used * (rate / 100) * 100) / 100
    const backMs = position.settledAtMs || position.backAtMs || returnAt
    const bp = sastParts(backMs)
    return {
      phase: 'settled',
      liveRatePct: live,
      lockedRatePct: rate,
      displayRatePct: rate,
      rateLabel: `${formatNoteRate(rate)}%`,
      cardSub: `returned · ${WD_SHORT[bp.weekday]} ${pad2(bp.hour)}:${pad2(bp.minute)}`,
      title: `${formatDeskTitleMoney(returned)} back.`,
      sentence: `${usedPct}% of your USDC funded deliveries at ${formatNoteRate(rate)}%. The ${unusedPct}% that wasn't needed came back with no return.`,
      panelLabel: 'SETTLED',
      pill: 'Returned',
      pillTone: 'ok',
      panelBig: formatDeskTitleMoney(returned),
      barPct: 100,
      metaLeft: `Supplied ${formatDetailUsd(supplied)}`,
      metaRight: '',
      nextStepRatePct: null,
      nextStepAtMs: null,
      returnAtMs: returnAt,
      openAtMs: openAt,
      cutoffAtMs: cutoffAt,
      supplyEnabled: true,
      supplyLabel: 'Fund next cycle',
      zarBackLabel: zarFunded > 0.005 ? `${formatZarMajor(zarFunded)} delivered` : 'R 0 delivered',
      usdcFrontMajor: returned,
      showBreakdown: true,
      breakdown: {
        supplied,
        used,
        usedPct,
        earned,
        lockedRatePct: rate,
        backInWallet: returned,
      },
      showSolscan: Boolean(position.lastSupply?.signature),
    }
  }

  // Late (past return with supply still out)
  if ((lateFlag || (hasSupply && pastReturn && !settled)) && hasSupply) {
    const rate = locked ?? live
    const earnCap =
      Number(position.expectedEarnedUsd) > 0.005
        ? Number(position.expectedEarnedUsd)
        : maxEarnUsd(supplied, rate)
    return {
      phase: 'late',
      liveRatePct: live,
      lockedRatePct: rate,
      displayRatePct: rate,
      rateLabel: `${formatNoteRate(rate)}% locked`,
      cardSub: `${formatNoteRate(rate)}% locked · back soon`,
      title: `${formatDeskTitleMoney(supplied)} funding today's deliveries.`,
      sentence:
        'A delivery is running late. Your USDC comes back as soon as it lands.',
      panelLabel: formatReturnLabel(returnAt),
      pill: 'Late',
      pillTone: 'late',
      panelBig: `Up to ${formatDeskTitleMoney(earnCap)}`,
      barPct: Math.round(noteInUseShare(position) * 100),
      metaLeft: position.suppliedAtMs
        ? `Funded ${formatWhenShort(position.suppliedAtMs)}`
        : 'Funded —',
      metaRight: 'Waiting on delivery',
      nextStepRatePct: null,
      nextStepAtMs: null,
      returnAtMs: returnAt,
      openAtMs: openAt,
      cutoffAtMs: cutoffAt,
      supplyEnabled: true,
      supplyLabel: 'Supply more',
      zarBackLabel:
        zarFunded > 0.005 ? `${formatZarMajor(zarFunded)} funded` : 'R 0 funded',
      usdcFrontMajor: supplied,
      showBreakdown: false,
      showSolscan: Boolean(position.lastSupply?.signature),
    }
  }

  // Funded
  if (hasSupply) {
    const rate = locked ?? live
    const earnCap =
      Number(position.expectedEarnedUsd) > 0.005
        ? Number(position.expectedEarnedUsd)
        : maxEarnUsd(supplied, rate)
    const toGo = Math.max(0, returnAt - nowMs)
    const fundedAt = position.suppliedAtMs || openAt
    const elapsed = Math.max(0, nowMs - fundedAt)
    const totalWindow = Math.max(1, returnAt - fundedAt)
    const timeBar = Math.round(Math.min(100, (elapsed / totalWindow) * 100))
    const fundCycle = noteCycleWindow(fundedAt)
    const sameCycleDay =
      ymdKey(fundCycle.cycleDay) === ymdKey(cycleDay) || inStepWindow
    return {
      phase: 'funded',
      liveRatePct: live,
      lockedRatePct: rate,
      displayRatePct: rate,
      rateLabel: `${formatNoteRate(rate)}% locked`,
      cardSub: `${formatNoteRate(rate)}% locked · ${backBy}`,
      title: `${formatDeskTitleMoney(supplied)} funding ${
        sameCycleDay ? "today's" : `${formatWdLong(fundCycle.cycleDay).toLowerCase()}'s`
      } deliveries.`,
      sentence: `Your rate is locked at ${formatNoteRate(rate)}%. ${formatDeskTitleMoney(used)} is already in use. Back by ${formatWhenShort(returnAt)} SAST with up to ${formatDeskTitleMoney(earnCap)}.`,
      panelLabel: formatReturnLabel(returnAt),
      pill: 'On time',
      pillTone: 'ok',
      panelBig: `Up to ${formatDeskTitleMoney(earnCap)}`,
      barPct: timeBar,
      metaLeft: position.suppliedAtMs
        ? `Funded ${formatWhenShort(position.suppliedAtMs)}`
        : 'Funded —',
      metaRight: `${formatCountdownHms(toGo)} to go`,
      nextStepRatePct: null,
      nextStepAtMs: null,
      returnAtMs: returnAt,
      openAtMs: openAt,
      cutoffAtMs: cutoffAt,
      // Always open — extra supply rolls into the live / next cycle rules.
      supplyEnabled: true,
      supplyLabel: 'Supply more',
      zarBackLabel:
        zarFunded > 0.005 ? `${formatZarMajor(zarFunded)} funded` : 'R 0 funded',
      usdcFrontMajor: supplied,
      showBreakdown: false,
      showSolscan: Boolean(position.lastSupply?.signature),
    }
  }

  // Unfunded — step-down window for the joined cycle
  if (inStepWindow) {
    const elapsedOpen = Math.max(0, nowMs - openAt)
    const openWindow = Math.max(1, cutoffAt - openAt)
    const openBar = Math.round(Math.min(100, (elapsedOpen / openWindow) * 100))
    const stepRight =
      nextAt != null && nextRate != null
        ? `${formatNoteRate(nextRate)}% in ${formatCountdownHms(nextAt - nowMs)}`
        : `Flat ${formatNoteRate(DELIVERY_NOTE.preorderRatePct)}% after ${pad2(DELIVERY_NOTE.cutoffTime.hour)}:${pad2(DELIVERY_NOTE.cutoffTime.minute)}`
    return {
      phase: 'open',
      liveRatePct: live,
      lockedRatePct: null,
      displayRatePct: live,
      rateLabel: `${formatNoteRate(live)}% if used`,
      cardSub: `${formatNoteRate(live)}% if used · ${backBy}`,
      title: "Fund today's deliveries.",
      sentence: `Fund before ${pad2(DELIVERY_NOTE.cutoffTime.hour)}:${pad2(DELIVERY_NOTE.cutoffTime.minute)} to join today's cycle. Back by ${formatWhenShort(returnAt)}. The rate steps down every hour, so earlier earns more.`,
      panelLabel: "TODAY'S RATE",
      pill: 'Open',
      pillTone: 'open',
      panelBig: `${formatNoteRate(live)}% if used`,
      barPct: openBar,
      metaLeft: `Opened ${pad2(DELIVERY_NOTE.openTime.hour)}:${pad2(DELIVERY_NOTE.openTime.minute)} at ${formatNoteRate(DELIVERY_NOTE.openRatePct)}%`,
      metaRight: stepRight,
      nextStepRatePct: nextRate,
      nextStepAtMs: nextAt,
      returnAtMs: returnAt,
      openAtMs: openAt,
      cutoffAtMs: cutoffAt,
      supplyEnabled: true,
      supplyLabel: 'Supply USDC',
      zarBackLabel: 'R 0 funded',
      usdcFrontMajor: 0,
      showBreakdown: false,
      showSolscan: false,
    }
  }

  // Unfunded — pre-order (before open or after cut-off). Always open; no "note full".
  const cycleStartsIn = Math.max(0, openAt - nowMs)
  const cycleAlreadyOpen = nowMs >= openAt
  const nextName = formatWdLong(cycleDay)
  const panelBig = cycleAlreadyOpen
    ? `${formatNoteRate(live)}% if used`
    : `${formatNoteRate(DELIVERY_NOTE.preorderRatePct)}% if used`
  const metaRight = cycleAlreadyOpen
    ? `${formatCountdownHms(Math.max(0, returnAt - nowMs))} to return`
    : `Cycle starts in ${formatCountdownHms(cycleStartsIn)}`
  return {
    phase: 'preorder',
    liveRatePct: live,
    lockedRatePct: null,
    displayRatePct: live,
    rateLabel: `${formatNoteRate(live)}% if used`,
    cardSub: `${formatNoteRate(live)}% if used · ${backBy}`,
    title: cycleAlreadyOpen
      ? `Fund ${nextName}'s deliveries.`
      : "Fund tomorrow's deliveries.",
    sentence: cycleAlreadyOpen
      ? `Today's step-down window closed at ${pad2(DELIVERY_NOTE.cutoffTime.hour)}:${pad2(DELIVERY_NOTE.cutoffTime.minute)}. Fund now for the ${nextName} cycle. Back ${formatWhenShort(returnAt)}.`
      : `Today's cycle closed at ${pad2(DELIVERY_NOTE.cutoffTime.hour)}:${pad2(DELIVERY_NOTE.cutoffTime.minute)}. Fund now to join ${nextName}'s cycle at ${pad2(DELIVERY_NOTE.openTime.hour)}:${pad2(DELIVERY_NOTE.openTime.minute)}. Back ${formatWhenShort(returnAt)}.`,
    panelLabel: cycleAlreadyOpen ? `${nextName.toUpperCase()}'S RATE` : "TOMORROW'S RATE",
    pill: 'Pre-order',
    pillTone: 'preorder',
    panelBig,
    barPct: cycleAlreadyOpen
      ? Math.round(
          Math.min(
            100,
            Math.max(0, ((nowMs - openAt) / Math.max(1, returnAt - openAt)) * 100)
          )
        )
      : 0,
    metaLeft: cycleAlreadyOpen
      ? `Flat ${formatNoteRate(DELIVERY_NOTE.preorderRatePct)}% until return`
      : `Flat until ${pad2(DELIVERY_NOTE.openTime.hour)}:${pad2(DELIVERY_NOTE.openTime.minute)}`,
    metaRight,
    nextStepRatePct: nextRate,
    nextStepAtMs: nextAt,
    returnAtMs: returnAt,
    openAtMs: openAt,
    cutoffAtMs: cutoffAt,
    supplyEnabled: true,
    supplyLabel: 'Supply USDC',
    zarBackLabel: 'R 0 funded',
    usdcFrontMajor: 0,
    showBreakdown: false,
    showSolscan: false,
  }
}

function formatDeskTitleMoney(amount: number): string {
  const n = Math.max(0, Number(amount) || 0)
  if (n >= 999.995) {
    return `$${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`
  }
  return `$${n.toFixed(2)}`
}

function formatDetailUsd(amount: number): string {
  const n = Math.max(0, Number(amount) || 0)
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatZarMajor(amount: number): string {
  const n = Math.max(0, Number(amount) || 0)
  if (n >= 999.995) {
    return `R ${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`
  }
  return `R ${n.toFixed(2)}`
}

export { formatDetailUsd, formatWhenShort, formatReturnLabel }

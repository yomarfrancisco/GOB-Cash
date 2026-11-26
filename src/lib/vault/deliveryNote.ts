/**
 * Earn delivery note — 24h USDC note with hourly step-down rates (Part 19).
 * All schedule/rate knobs live here; UI must not hard-code them.
 */
import { sellMznPerUsd } from '@/lib/mznZar'
import { sastParts, sastToUtcMs } from '@/lib/routing/routingTime'
import type { VaultPosition } from '@/store/vault'

export const DELIVERY_NOTE = {
  openTime: { hour: 9, minute: 0 },
  /** USDC returned next calendar day at this SAST clock (was 04:00). */
  returnTime: { hour: 15, minute: 0 },
  cutoffTime: { hour: 21, minute: 0 },
  openRatePct: 6.5,
  stepDownPct: 0.25,
  stepEveryMinutes: 60,
  floorRatePct: 3.5,
} as const

export type DeliveryNotePhase = 'open' | 'funded' | 'settled' | 'closed' | 'late'

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
  pillTone: 'ok' | 'late' | 'open' | 'closed'
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

function todayOpenMs(nowMs: number): number {
  const p = sastParts(nowMs)
  return sastToUtcMs(p.year, p.month, p.day, DELIVERY_NOTE.openTime.hour, DELIVERY_NOTE.openTime.minute)
}

function todayCutoffMs(nowMs: number): number {
  const p = sastParts(nowMs)
  return sastToUtcMs(
    p.year,
    p.month,
    p.day,
    DELIVERY_NOTE.cutoffTime.hour,
    DELIVERY_NOTE.cutoffTime.minute
  )
}

/** Return deadline: 15:00 SAST next calendar day after today's open. */
export function noteReturnAtMs(nowMs: number): number {
  const open = todayOpenMs(nowMs)
  const p = sastParts(open)
  const nextDay = new Date(Date.UTC(p.year, p.month - 1, p.day) + 24 * 3600 * 1000)
  return sastToUtcMs(
    nextDay.getUTCFullYear(),
    nextDay.getUTCMonth() + 1,
    nextDay.getUTCDate(),
    DELIVERY_NOTE.returnTime.hour,
    DELIVERY_NOTE.returnTime.minute
  )
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Absolute return clock for prose: "15:00 SAST (13:00 GMT)". */
export function formatReturnAbsolute(): string {
  const h = DELIVERY_NOTE.returnTime.hour
  const m = DELIVERY_NOTE.returnTime.minute
  const gmtH = (h - 2 + 24) % 24
  return `${pad2(h)}:${pad2(m)} SAST (${pad2(gmtH)}:${pad2(m)} GMT)`
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
  return todayOpenMs(nowMs)
}

export function noteCutoffAtMs(nowMs: number): number {
  return todayCutoffMs(nowMs)
}

/** Live supplier rate at `atMs` (locked when deposit lands). */
export function liveNoteRatePct(atMs: number): number {
  const open = todayOpenMs(atMs)
  const cutoff = todayCutoffMs(atMs)
  if (atMs < open) return DELIVERY_NOTE.openRatePct
  const end = Math.min(atMs, cutoff)
  const steps = Math.floor((end - open) / (DELIVERY_NOTE.stepEveryMinutes * 60_000))
  const rate = DELIVERY_NOTE.openRatePct - steps * DELIVERY_NOTE.stepDownPct
  return Math.max(DELIVERY_NOTE.floorRatePct, Math.round(rate * 100) / 100)
}

export function nextStepAtMs(nowMs: number): number | null {
  const open = todayOpenMs(nowMs)
  const cutoff = todayCutoffMs(nowMs)
  if (nowMs >= cutoff) return null
  if (nowMs < open) return open
  const elapsed = nowMs - open
  const stepMs = DELIVERY_NOTE.stepEveryMinutes * 60_000
  const next = open + (Math.floor(elapsed / stepMs) + 1) * stepMs
  if (next >= cutoff) return null
  const nextRate = liveNoteRatePct(next)
  if (nextRate >= liveNoteRatePct(nowMs) - 0.0001 && nextRate <= DELIVERY_NOTE.floorRatePct + 0.0001) {
    // Already at floor — no further step labels
    if (liveNoteRatePct(nowMs) <= DELIVERY_NOTE.floorRatePct + 0.0001) return null
  }
  return next
}

function formatWhenShort(ms: number): string {
  const p = sastParts(ms)
  return `${WD_SHORT[p.weekday]} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}

function formatReturnLabel(ms: number): string {
  const p = sastParts(ms)
  return `BACK BY ${WD_SHORT[p.weekday].toUpperCase()} ${pad2(DELIVERY_NOTE.returnTime.hour)}:${pad2(DELIVERY_NOTE.returnTime.minute)} SAST`
}

function usedUsdc(position: VaultPosition): number {
  const used = Number(position.usedUsdc)
  if (Number.isFinite(used) && used >= 0) return used
  return Math.max(0, Number(position.committedUsdc) || 0)
}

/** Max return if the full supply is used for deliveries. */
function maxEarnUsd(supplied: number, ratePct: number): number {
  return Math.round(supplied * (ratePct / 100) * 100) / 100
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

/** USD return at the locked (or live) 24h note premium on supplied USDC. */
export function homeEarnExpectedUsd(position: VaultPosition, nowMs = Date.now()): number {
  const supplied = Math.max(0, Number(position.suppliedUsdc) || 0)
  if (!(supplied > 0.005)) return 0
  const stored = Math.max(0, Number(position.expectedEarnedUsd) || 0)
  if (stored > 0.005) return Math.round(stored * 100) / 100
  const locked = position.lockedRatePct
  const rate =
    typeof locked === 'number' && Number.isFinite(locked) && locked > 0
      ? locked
      : liveNoteRatePct(nowMs)
  return maxEarnUsd(supplied, rate)
}

/**
 * Home Earn minor: MZN value of the 24h note premium (SELL Mt/$ × expected USD earn).
 * `sellMznQuote` / `usdPerZarQuote` are `/api/fx/latest` raws.
 */
export function homeEarnExpectedMzn(
  position: VaultPosition,
  sellMznQuote: number,
  usdPerZarQuote: number,
  nowMs = Date.now()
): number {
  const usd = homeEarnExpectedUsd(position, nowMs)
  if (!(usd > 0.005)) return 0
  const mtPerUsd = sellMznPerUsd(sellMznQuote, usdPerZarQuote)
  if (!(mtPerUsd > 0)) return 0
  return Math.round(usd * mtPerUsd * 100) / 100
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
  const openAt = noteOpenAtMs(nowMs)
  const cutoffAt = noteCutoffAtMs(nowMs)
  const returnAt = noteReturnAtMs(nowMs)
  const live = liveNoteRatePct(nowMs)
  const nextAt = nextStepAtMs(nowMs)
  const nextRate = nextAt != null ? liveNoteRatePct(nextAt) : null

  const supplied = Number(position.suppliedUsdc) || 0
  const hasSupply = supplied > 0.005
  const locked =
    typeof position.lockedRatePct === 'number' && Number.isFinite(position.lockedRatePct)
      ? position.lockedRatePct
      : hasSupply
        ? liveNoteRatePct(position.suppliedAtMs || position.lastSupply?.atMs || nowMs)
        : null
  const used = usedUsdc(position)
  const zarFunded = Math.max(0, Number(position.zarFunded) || Number(position.zarEarned) || 0)
  const settled =
    position.notePhase === 'settled' ||
    (typeof position.returnedUsdc === 'number' && position.returnedUsdc > 0.005)
  const closedFlag = position.notePhase === 'closed' || position.noteFull === true
  const lateFlag = position.notePhase === 'late'

  const pastCutoff = nowMs >= cutoffAt
  const beforeOpen = nowMs < openAt
  const pastReturn = nowMs >= returnAt

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
      cardSub: `returned · ${String(bp.hour).padStart(2, '0')}:${String(bp.minute).padStart(2, '0')}`,
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
      supplyLabel: 'Fund tomorrow',
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

  const backIn = formatBackInRough(Math.max(0, returnAt - nowMs))
  const returnAbs = formatReturnAbsolute()

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
      supplyEnabled: false,
      supplyLabel: 'Waiting',
      zarBackLabel:
        zarFunded > 0.005 ? `${formatZarMajor(zarFunded)} funded` : 'R 0 funded',
      usdcFrontMajor: supplied,
      showBreakdown: false,
      showSolscan: Boolean(position.lastSupply?.signature),
    }
  }

  // Funded (note open, has supply)
  if (hasSupply) {
    const rate = locked ?? live
    const earnCap =
      Number(position.expectedEarnedUsd) > 0.005
        ? Number(position.expectedEarnedUsd)
        : maxEarnUsd(supplied, rate)
    const toGo = Math.max(0, returnAt - nowMs)
    const elapsed = Math.max(0, nowMs - (position.suppliedAtMs || openAt))
    const totalWindow = Math.max(1, returnAt - (position.suppliedAtMs || openAt))
    const timeBar = Math.round(Math.min(100, (elapsed / totalWindow) * 100))
    return {
      phase: 'funded',
      liveRatePct: live,
      lockedRatePct: rate,
      displayRatePct: rate,
      rateLabel: `${formatNoteRate(rate)}% locked`,
      cardSub: `${formatNoteRate(rate)}% locked · ${backIn}`,
      title: `${formatDeskTitleMoney(supplied)} funding today's deliveries.`,
      sentence: `Your rate is locked at ${formatNoteRate(rate)}%. ${formatDeskTitleMoney(used)} is already in use. Back by ${returnAbs} with up to ${formatDeskTitleMoney(earnCap)}.`,
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
      supplyEnabled: !pastCutoff && !closedFlag,
      supplyLabel: 'Supply more',
      zarBackLabel:
        zarFunded > 0.005 ? `${formatZarMajor(zarFunded)} funded` : 'R 0 funded',
      usdcFrontMajor: supplied,
      showBreakdown: false,
      showSolscan: Boolean(position.lastSupply?.signature),
    }
  }

  // Closed / before open / past cutoff without supply
  if (closedFlag || pastCutoff || beforeOpen) {
    const nextOpenLabel = beforeOpen
      ? `Opens ${pad2(DELIVERY_NOTE.openTime.hour)}:${pad2(DELIVERY_NOTE.openTime.minute)}`
      : 'Opens 09:00'
    return {
      phase: 'closed',
      liveRatePct: live,
      lockedRatePct: null,
      displayRatePct: live,
      rateLabel: `${formatNoteRate(live)}% if used`,
      cardSub: `${formatNoteRate(live)}% if used · ${backIn}`,
      title: "Fund today's deliveries.",
      sentence: beforeOpen
        ? `Today's note opens at ${pad2(DELIVERY_NOTE.openTime.hour)}:${pad2(DELIVERY_NOTE.openTime.minute)} SAST. Fund early, earn more: the rate steps down every hour.`
        : "Today's note is full. Next one opens 09:00.",
      panelLabel: "TODAY'S RATE",
      pill: 'Closed',
      pillTone: 'closed',
      panelBig: `${formatNoteRate(live)}% if used`,
      barPct: pastCutoff
        ? 100
        : Math.round(
            Math.min(100, Math.max(0, ((nowMs - openAt) / Math.max(1, cutoffAt - openAt)) * 100))
          ),
      metaLeft: `Opened 09:00 at ${formatNoteRate(DELIVERY_NOTE.openRatePct)}%`,
      metaRight: nextOpenLabel,
      nextStepRatePct: null,
      nextStepAtMs: null,
      returnAtMs: returnAt,
      openAtMs: openAt,
      cutoffAtMs: cutoffAt,
      supplyEnabled: false,
      supplyLabel: nextOpenLabel,
      zarBackLabel: 'R 0 funded',
      usdcFrontMajor: 0,
      showBreakdown: false,
      showSolscan: false,
    }
  }

  // Open, unfunded
  const elapsedOpen = Math.max(0, nowMs - openAt)
  const openWindow = Math.max(1, cutoffAt - openAt)
  const openBar = Math.round(Math.min(100, (elapsedOpen / openWindow) * 100))
  const stepRight =
    nextAt != null && nextRate != null
      ? `${formatNoteRate(nextRate)}% in ${formatCountdownHms(nextAt - nowMs)}`
      : `Floor ${formatNoteRate(DELIVERY_NOTE.floorRatePct)}%`
  return {
    phase: 'open',
    liveRatePct: live,
    lockedRatePct: null,
    displayRatePct: live,
    rateLabel: `${formatNoteRate(live)}% if used`,
    cardSub: `${formatNoteRate(live)}% if used · ${backIn}`,
    title: "Fund today's deliveries.",
    sentence: `Your USDC is back by ${returnAbs} tomorrow. Fund early, earn more: the rate steps down every hour.`,
    panelLabel: "TODAY'S RATE",
    pill: 'Open',
    pillTone: 'open',
    panelBig: `${formatNoteRate(live)}% if used`,
    barPct: openBar,
    metaLeft: `Opened 09:00 at ${formatNoteRate(DELIVERY_NOTE.openRatePct)}%`,
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

export { formatDetailUsd }

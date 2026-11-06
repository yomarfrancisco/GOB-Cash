/**
 * UI-only home-card day clock: MZN → TRANSIT drip on a variable 20–50s cycle,
 * TRANSIT bar to 09:00 SAST, ZAR 15s clear ceremony at 09:00. No wallet writes.
 */

import { sastParts, sastToUtcMs } from '@/lib/routing/routingTime'

/** Fast MZN drip cycle length bounds. */
export const MZN_DRIP_CYCLE_MIN_MS = 20_000
export const MZN_DRIP_CYCLE_MAX_MS = 50_000
/** 5s drip scale unit (drip size grows with cycle length relative to this). */
export const FIVE_SECOND_MS = 5_000
/** @deprecated Use FIVE_SECOND_MS for drip scale; MIN/MAX for cycle length. */
export const MZN_DRIP_CYCLE_MS = FIVE_SECOND_MS
export const ZAR_CLEAR_CEREMONY_MS = 15_000
/** Live ceremony start window after 09:00 SAST; past this → instant overlay catch-up. */
export const ZAR_CLEAR_CATCHUP_GRACE_MS = ZAR_CLEAR_CEREMONY_MS + 2_000

/**
 * Decide how to clear the UI-only TRANSIT drip after a 09:00 SAST boundary.
 * Long-lived sessions that miss the live ceremony window must still drop the overlay.
 */
export function resolveZarClearOverlayAction(params: {
  nowMs: number
  lastNineMs: number
  lastNineHandledMs: number
  transitZarDelta: number
  zarCeremonyActive: boolean
}): 'start_ceremony' | 'instant_reset' | 'none' {
  if (params.zarCeremonyActive) return 'none'
  if (!(params.lastNineMs > 0) || params.lastNineMs === params.lastNineHandledMs) return 'none'
  if (!(params.nowMs >= params.lastNineMs)) return 'none'
  if (!(params.transitZarDelta > 0)) return 'none'
  if (params.nowMs - params.lastNineMs < ZAR_CLEAR_CATCHUP_GRACE_MS) return 'start_ceremony'
  return 'instant_reset'
}

/** Previous 09:00 SAST at or before nowMs. */
export function lastSettleAt09hSast(nowMs: number): number {
  const p = sastParts(nowMs)
  const todayNine = sastToUtcMs(p.year, p.month, p.day, 9, 0, 0)
  if (nowMs >= todayNine) return todayNine
  return todayNine - 24 * 60 * 60 * 1000
}

/** Next 09:00 SAST strictly after nowMs (if exactly 09:00, returns tomorrow). */
export function nextSettleAt09hSastExclusive(nowMs: number): number {
  const p = sastParts(nowMs)
  const todayNine = sastToUtcMs(p.year, p.month, p.day, 9, 0, 0)
  if (nowMs < todayNine) return todayNine
  return todayNine + 24 * 60 * 60 * 1000
}

/** 0–100: progress of the day window from last 09:00 → next 09:00. */
export function transitDayBarPercent(nowMs: number): number {
  const start = lastSettleAt09hSast(nowMs)
  const end = nextSettleAt09hSastExclusive(nowMs)
  const span = Math.max(1, end - start)
  return Math.max(0, Math.min(100, ((nowMs - start) / span) * 100))
}

/** Uniform random cycle length in [min, max] inclusive of bounds (ms, whole seconds). */
export function randomMznDripCycleMs(
  random: () => number = Math.random,
  minMs: number = MZN_DRIP_CYCLE_MIN_MS,
  maxMs: number = MZN_DRIP_CYCLE_MAX_MS
): number {
  const lo = Math.min(minMs, maxMs)
  const hi = Math.max(minMs, maxMs)
  const span = Math.max(0, hi - lo)
  return Math.round(lo + random() * span)
}

/** MZN bar fill within the current cycle (0–100). */
export function mznCycleBarPercent(
  nowMs: number,
  cycleAnchorMs: number,
  cycleDurationMs: number = MZN_DRIP_CYCLE_MIN_MS
): number {
  const duration = Math.max(1, cycleDurationMs)
  const elapsed = Math.max(0, nowMs - cycleAnchorMs)
  return Math.max(0, Math.min(100, (elapsed / duration) * 100))
}

/** ZAR clear ceremony bar 0–100 over 15s from ceremonyStartMs. */
export function zarClearBarPercent(nowMs: number, ceremonyStartMs: number | null): number {
  if (ceremonyStartMs == null || ceremonyStartMs <= 0) return 0
  const elapsed = Math.max(0, nowMs - ceremonyStartMs)
  return Math.max(0, Math.min(100, (elapsed / ZAR_CLEAR_CEREMONY_MS) * 100))
}

export function remainingFiveSecondTicksUntil(nowMs: number, untilMs: number): number {
  const remaining = Math.max(0, untilMs - nowMs)
  return Math.max(1, Math.ceil(remaining / FIVE_SECOND_MS))
}

/**
 * Micro MZN drip for one completed cycle of `cycleDurationMs`.
 * Scaled so a longer cycle deposits proportionally more toward 09:00.
 */
export function microDripMzn(params: {
  remainingPlannedMzn: number
  visibleMzn: number
  nowMs: number
  cycleDurationMs?: number
}): number {
  const cycleMs = Math.max(1, params.cycleDurationMs ?? MZN_DRIP_CYCLE_MIN_MS)
  const nextNine = nextSettleAt09hSastExclusive(params.nowMs)
  const remainingMs = Math.max(cycleMs, nextNine - params.nowMs)
  const planned = Number.isFinite(params.remainingPlannedMzn)
    ? Math.max(0, params.remainingPlannedMzn)
    : 0
  if (planned > 0) {
    const drip = planned * (cycleMs / remainingMs)
    return Math.round(Math.min(planned, drip) * 100) / 100
  }
  const visible = Math.max(0, params.visibleMzn)
  if (!(visible > 0)) return 0
  // ~0.05% of visible per 5s baseline, scaled by cycle length; capped by remaining share.
  const scale = cycleMs / FIVE_SECOND_MS
  const slice = Math.max(
    0.01,
    Math.min(visible * 0.0005 * scale, visible * (cycleMs / remainingMs))
  )
  return Math.round(slice * 100) / 100
}

/** MZN drip → TRANSIT R at sell Mt/R (same quote as the ZAR card). */
export function mznToTransitZar(mznAmount: number, sellMznPerZar: number): number {
  if (!(mznAmount > 0) || !(sellMznPerZar > 0)) return 0
  return Math.round((mznAmount / sellMznPerZar) * 100) / 100
}

/**
 * Fixed drip cycle for every client — no Math.random, so two tabs stay aligned.
 * Midpoint of the old 20–50s band.
 */
export const SHARED_MZN_DRIP_CYCLE_MS = 35_000

export type SharedDripProgress = {
  drippedMzn: number
  /** Negative offset applied to the MZN card major. */
  displayMznOffset: number
  /** Positive ZAR added to the combined ZAR book (in-route). */
  displayTransitZarOffset: number
  /** 0–100 fill within the current shared cycle. */
  mznCycleBarPercent: number
}

/**
 * Slow MZN→in-route drip derived only from wallets + SAST wall clock.
 * Same inputs ⇒ same outputs on every device (source of truth stays Firestore;
 * this is a shared projection until the next real book/clear).
 */
export function sharedDripProgress(params: {
  walletMzn: number
  sellMznPerZar: number
  nowMs: number
  remainingPlannedMzn?: number
  cycleDurationMs?: number
}): SharedDripProgress {
  const empty: SharedDripProgress = {
    drippedMzn: 0,
    displayMznOffset: 0,
    displayTransitZarOffset: 0,
    mznCycleBarPercent: 0,
  }
  const walletMzn = Math.max(0, Number(params.walletMzn) || 0)
  const sell = Number(params.sellMznPerZar) || 0
  if (!(walletMzn > 0) || !(sell > 0)) return empty

  const cycleMs = Math.max(1, params.cycleDurationMs ?? SHARED_MZN_DRIP_CYCLE_MS)
  const dayStart = lastSettleAt09hSast(params.nowMs)
  const elapsed = Math.max(0, params.nowMs - dayStart)
  const completedCycles = Math.floor(elapsed / cycleMs)
  const cycleFrac = Math.min(1, (elapsed % cycleMs) / cycleMs)

  // Amounts move only on completed cycles — never mid-cycle. The bar alone
  // tracks cycleFrac so the drip still feels continuous without twitching R/Mt.
  let remaining = walletMzn
  let plannedLeft = Math.max(0, Number(params.remainingPlannedMzn) || 0)
  for (let i = 0; i < completedCycles; i++) {
    if (!(remaining > 0)) break
    const atMs = dayStart + (i + 1) * cycleMs
    const drip = microDripMzn({
      remainingPlannedMzn: plannedLeft,
      visibleMzn: remaining,
      nowMs: atMs,
      cycleDurationMs: cycleMs,
    })
    const take = Math.min(remaining, drip)
    remaining = Math.round((remaining - take) * 100) / 100
    if (plannedLeft > 0) plannedLeft = Math.max(0, Math.round((plannedLeft - take) * 100) / 100)
  }

  const drippedMzn = Math.max(0, Math.round((walletMzn - remaining) * 100) / 100)
  return {
    drippedMzn,
    displayMznOffset: -drippedMzn,
    displayTransitZarOffset: mznToTransitZar(drippedMzn, sell),
    mznCycleBarPercent: Math.round(cycleFrac * 10_000) / 100,
  }
}

export type TransitDayOverlay = {
  /** MZN deducted from wallet display (always ≥ 0). */
  mznDelta: number
  /** ZAR added to TRANSIT display (always ≥ 0). */
  transitZarDelta: number
  /** After 09:00 ceremony: ZAR major credited from cleared TRANSIT R. */
  zarMajorDelta: number
  /** True while the 15s ZAR fill animation runs. */
  zarCeremonyActive: boolean
  zarCeremonyStartMs: number | null
  /** Anchor for the current MZN cycle. */
  mznCycleAnchorMs: number
  /** Length of the current MZN cycle (20–50s). */
  mznCycleDurationMs: number
}

export function createInitialOverlay(
  nowMs: number,
  random: () => number = Math.random
): TransitDayOverlay {
  return {
    mznDelta: 0,
    transitZarDelta: 0,
    zarMajorDelta: 0,
    zarCeremonyActive: false,
    zarCeremonyStartMs: null,
    mznCycleAnchorMs: nowMs,
    mznCycleDurationMs: randomMznDripCycleMs(random),
  }
}

/** True once MZN, liquid ZAR, or in-route ZAR exists. */
export function inventoryBarsArmed(params: {
  walletMzn: number
  walletZar?: number
  walletTransitZar?: number
  overlayMznDelta?: number
  overlayTransitZarDelta?: number
}): boolean {
  return (
    Number(params.walletMzn) > 0 ||
    Number(params.walletZar) > 0 ||
    Number(params.walletTransitZar) > 0 ||
    Number(params.overlayMznDelta) > 0 ||
    Number(params.overlayTransitZarDelta) > 0
  )
}

/**
 * Home time-bar percents with empty-until-funded rules:
 * - no history → all 0
 * - MZN funded → MZN fast drip cycle
 * - ZAR card (liquid + in-route) → day fill toward 09:00 (former ROUTE bar)
 * - zarBarPercent kept for ceremony flicker if needed
 */
export function inventoryTimeBarPercents(params: {
  nowMs: number
  walletMzn: number
  walletZar?: number
  walletTransitZar?: number
  overlay: Pick<
    TransitDayOverlay,
    | 'mznDelta'
    | 'transitZarDelta'
    | 'zarCeremonyActive'
    | 'zarCeremonyStartMs'
    | 'mznCycleAnchorMs'
    | 'mznCycleDurationMs'
  >
}): { mznBarPercent: number; transitBarPercent: number; zarBarPercent: number } {
  const armed = inventoryBarsArmed({
    walletMzn: params.walletMzn,
    walletZar: params.walletZar,
    walletTransitZar: params.walletTransitZar,
    overlayMznDelta: params.overlay.mznDelta,
    overlayTransitZarDelta: params.overlay.transitZarDelta,
  })
  if (!armed) {
    return { mznBarPercent: 0, transitBarPercent: 0, zarBarPercent: 0 }
  }

  const mznActive =
    Number(params.walletMzn) > 0 || Number(params.overlay.mznDelta) > 0
  const mznBarPercent = mznActive
    ? mznCycleBarPercent(
        params.nowMs,
        params.overlay.mznCycleAnchorMs,
        params.overlay.mznCycleDurationMs
      )
    : 0

  // Day bar drives the ZAR card (ROUTE collapsed into ZAR).
  const zarBookActive =
    Number(params.walletZar) > 0 ||
    Number(params.walletTransitZar) > 0 ||
    Number(params.overlay.transitZarDelta) > 0
  const transitBarPercent = zarBookActive ? transitDayBarPercent(params.nowMs) : 0
  const zarBarPercent = params.overlay.zarCeremonyActive
    ? zarClearBarPercent(params.nowMs, params.overlay.zarCeremonyStartMs)
    : transitBarPercent

  return { mznBarPercent, transitBarPercent, zarBarPercent }
}

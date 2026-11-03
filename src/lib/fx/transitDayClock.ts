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

/** True once MZN has been funded or a ROUTE book already exists. */
export function inventoryBarsArmed(params: {
  walletMzn: number
  walletTransitZar?: number
  overlayMznDelta?: number
  overlayTransitZarDelta?: number
}): boolean {
  return (
    Number(params.walletMzn) > 0 ||
    Number(params.walletTransitZar) > 0 ||
    Number(params.overlayMznDelta) > 0 ||
    Number(params.overlayTransitZarDelta) > 0
  )
}

/**
 * Home time-bar percents with empty-until-funded rules:
 * - no history → all 0
 * - MZN funded → MZN fast cycle + ROUTE day fill
 * - ZAR → only the 09:00 clear ceremony
 */
export function inventoryTimeBarPercents(params: {
  nowMs: number
  walletMzn: number
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

  const transitBarPercent = transitDayBarPercent(params.nowMs)
  const zarBarPercent = params.overlay.zarCeremonyActive
    ? zarClearBarPercent(params.nowMs, params.overlay.zarCeremonyStartMs)
    : 0

  return { mznBarPercent, transitBarPercent, zarBarPercent }
}

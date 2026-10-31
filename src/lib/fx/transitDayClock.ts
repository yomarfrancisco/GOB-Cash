/**
 * UI-only home-card day clock: MZN → TRANSIT drip every 5s, TRANSIT bar to 09:00 SAST,
 * ZAR 15s clear ceremony at 09:00. No wallet writes.
 */

import { sastParts, sastToUtcMs } from '@/lib/routing/routingTime'

export const MZN_DRIP_CYCLE_MS = 5_000
export const ZAR_CLEAR_CEREMONY_MS = 15_000
export const FIVE_SECOND_MS = MZN_DRIP_CYCLE_MS

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

/** MZN bar fill within the current 5s cycle (0–100). */
export function mznCycleBarPercent(nowMs: number, cycleAnchorMs: number): number {
  const elapsed = Math.max(0, nowMs - cycleAnchorMs)
  return Math.max(0, Math.min(100, (elapsed / MZN_DRIP_CYCLE_MS) * 100))
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
 * Micro MZN drip for one 5s tick.
 * Prefer remaining planned MZN / ticks to 09:00; else a tiny fraction of visible MZN.
 */
export function microDripMzn(params: {
  remainingPlannedMzn: number
  visibleMzn: number
  nowMs: number
}): number {
  const nextNine = nextSettleAt09hSastExclusive(params.nowMs)
  const ticks = remainingFiveSecondTicksUntil(params.nowMs, nextNine)
  const planned = Number.isFinite(params.remainingPlannedMzn)
    ? Math.max(0, params.remainingPlannedMzn)
    : 0
  if (planned > 0) {
    return Math.round((planned / ticks) * 100) / 100
  }
  const visible = Math.max(0, params.visibleMzn)
  if (!(visible > 0)) return 0
  // ~0.05% of visible MZN per tick, min 0.01, capped so we don't empty in one tick.
  const slice = Math.max(0.01, Math.min(visible * 0.0005, visible / ticks))
  return Math.round(slice * 100) / 100
}

export function mznToTransitUsd(mznAmount: number, sellMznPerUsd: number): number {
  if (!(mznAmount > 0) || !(sellMznPerUsd > 0)) return 0
  return Math.round((mznAmount / sellMznPerUsd) * 100) / 100
}

export type TransitDayOverlay = {
  /** MZN deducted from wallet display (always ≥ 0). */
  mznDelta: number
  /** USD added to TRANSIT display (always ≥ 0). */
  transitUsdDelta: number
  /** After 09:00 ceremony: ZAR major credited from cleared TRANSIT $. */
  zarMajorDelta: number
  /** True while the 15s ZAR fill animation runs. */
  zarCeremonyActive: boolean
  zarCeremonyStartMs: number | null
  /** Anchor for the current 5s MZN cycle. */
  mznCycleAnchorMs: number
}

export function createInitialOverlay(nowMs: number): TransitDayOverlay {
  return {
    mznDelta: 0,
    transitUsdDelta: 0,
    zarMajorDelta: 0,
    zarCeremonyActive: false,
    zarCeremonyStartMs: null,
    mznCycleAnchorMs: nowMs,
  }
}

/** TRANSIT $ → ZAR major at live USD/ZAR mid. */
export function transitUsdToZar(usdAmount: number, usdPerZarRate: number): number {
  if (!(usdAmount > 0) || !(usdPerZarRate > 0)) return 0
  return Math.round((usdAmount / usdPerZarRate) * 100) / 100
}

'use client'

import { useEffect, useRef, useState } from 'react'
import {
  MZN_DRIP_CYCLE_MS,
  ZAR_CLEAR_CEREMONY_MS,
  createInitialOverlay,
  lastSettleAt09hSast,
  microDripMzn,
  mznCycleBarPercent,
  mznToTransitUsd,
  nextSettleAt09hSastExclusive,
  transitDayBarPercent,
  zarClearBarPercent,
  type TransitDayOverlay,
} from '@/lib/fx/transitDayClock'

export type TransitDayClockView = {
  nowMs: number
  overlay: TransitDayOverlay
  mznBarPercent: number
  transitBarPercent: number
  zarBarPercent: number
  displayMznOffset: number
  displayTransitUsdOffset: number
  displayZarOffset: number
  transitCountdownLabel: string
}

function formatCountdown(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours <= 0) return `${minutes}m`
  return `${hours}h ${String(minutes).padStart(2, '0')}m`
}

/**
 * UI-only home clock. Pass live MZN wallet (major) and sell Mt/$ for drip sizing.
 */
export function useTransitDayClock(params: {
  enabled: boolean
  walletMzn: number
  sellMznPerUsd: number
  remainingPlannedMzn?: number
}): TransitDayClockView {
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [overlay, setOverlay] = useState<TransitDayOverlay>(() => createInitialOverlay(Date.now()))
  const lastNineHandledRef = useRef(0)
  const walletMznRef = useRef(params.walletMzn)
  const sellRef = useRef(params.sellMznPerUsd)
  const plannedRef = useRef(params.remainingPlannedMzn ?? 0)
  walletMznRef.current = params.walletMzn
  sellRef.current = params.sellMznPerUsd
  plannedRef.current = params.remainingPlannedMzn ?? 0

  useEffect(() => {
    if (!params.enabled) return

    const tick = () => {
      const t = Date.now()
      setNowMs(t)
      setOverlay((prev) => {
        const lastNine = lastSettleAt09hSast(t)

        if (
          !prev.zarCeremonyActive &&
          lastNine !== lastNineHandledRef.current &&
          t >= lastNine &&
          t - lastNine < ZAR_CLEAR_CEREMONY_MS + 2_000 &&
          prev.transitUsdDelta > 0
        ) {
          lastNineHandledRef.current = lastNine
          return {
            ...prev,
            zarCeremonyActive: true,
            zarCeremonyStartMs: t,
          }
        }

        if (
          prev.zarCeremonyActive &&
          prev.zarCeremonyStartMs != null &&
          t - prev.zarCeremonyStartMs >= ZAR_CLEAR_CEREMONY_MS
        ) {
          // Drop UI drip overlays. ZAR major comes from the daily wallet batch
          // (avoid double-count if we also credited zarMajorDelta here).
          return {
            mznDelta: 0,
            transitUsdDelta: 0,
            zarMajorDelta: 0,
            zarCeremonyActive: false,
            zarCeremonyStartMs: null,
            mznCycleAnchorMs: t,
          }
        }

        if (!prev.zarCeremonyActive && t - prev.mznCycleAnchorMs >= MZN_DRIP_CYCLE_MS) {
          const visibleMzn = Math.max(0, walletMznRef.current - prev.mznDelta)
          const remainingPlanned = Math.max(0, plannedRef.current - prev.mznDelta)
          const drip = microDripMzn({
            remainingPlannedMzn: remainingPlanned,
            visibleMzn,
            nowMs: t,
          })
          if (!(drip > 0) || drip > visibleMzn + 0.0001) {
            return { ...prev, mznCycleAnchorMs: t }
          }
          const usd = mznToTransitUsd(drip, sellRef.current)
          return {
            ...prev,
            mznDelta: Math.round((prev.mznDelta + drip) * 100) / 100,
            transitUsdDelta: Math.round((prev.transitUsdDelta + usd) * 100) / 100,
            mznCycleAnchorMs: t,
          }
        }

        return prev
      })
    }

    tick()
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [params.enabled])

  const nextNine = nextSettleAt09hSastExclusive(nowMs)
  const remainingMs = Math.max(0, nextNine - nowMs)

  return {
    nowMs,
    overlay,
    mznBarPercent: mznCycleBarPercent(nowMs, overlay.mznCycleAnchorMs),
    transitBarPercent: transitDayBarPercent(nowMs),
    zarBarPercent: overlay.zarCeremonyActive
      ? zarClearBarPercent(nowMs, overlay.zarCeremonyStartMs)
      : 0,
    displayMznOffset: -overlay.mznDelta,
    displayTransitUsdOffset: overlay.transitUsdDelta,
    displayZarOffset: overlay.zarMajorDelta,
    transitCountdownLabel: remainingMs > 0 ? formatCountdown(remainingMs) : '',
  }
}

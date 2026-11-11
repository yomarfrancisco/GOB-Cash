'use client'

import { useEffect, useState } from 'react'
import {
  inventoryBarsArmed,
  mznFastCycleArmed,
  nextSettleAt09hSastExclusive,
  sharedDripProgress,
  transitDayBarPercent,
} from '@/lib/fx/transitDayClock'

export type TransitDayClockView = {
  nowMs: number
  mznBarPercent: number
  transitBarPercent: number
  zarBarPercent: number
  /** Shared projection: −dripped MZN (same on every client). */
  displayMznOffset: number
  /** Shared projection: +dripped ZAR into the combined book. */
  displayTransitZarOffset: number
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
 * Shared inventory clock. Slow drip is a pure function of wallets + SAST time
 * (no per-tab random state), so every open session shows the same amounts.
 */
export function useTransitDayClock(params: {
  enabled: boolean
  walletMzn: number
  walletZar?: number
  walletTransitZar?: number
  sellMznPerZar: number
  /** When this MZN book arrived — drip only counts cycles after this. */
  mznSinceMs?: number | null
  remainingPlannedMzn?: number
  /** Cap projected transit ZAR to the next liquidity-event slice. */
  maxDripZar?: number | null
}): TransitDayClockView {
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    if (!params.enabled) return
    const tick = () => setNowMs(Date.now())
    tick()
    // 250ms so the shared drip projection eases within each 35s cycle.
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [params.enabled])

  const armed = inventoryBarsArmed({
    walletMzn: params.walletMzn,
    walletZar: params.walletZar,
    walletTransitZar: params.walletTransitZar,
  })

  const drip = params.enabled
    ? sharedDripProgress({
        walletMzn: params.walletMzn,
        sellMznPerZar: params.sellMznPerZar,
        nowMs,
        sinceMs: params.mznSinceMs,
        remainingPlannedMzn: params.remainingPlannedMzn,
        maxDripZar: params.maxDripZar,
      })
    : {
        drippedMzn: 0,
        displayMznOffset: 0,
        displayTransitZarOffset: 0,
        mznCycleBarPercent: 0,
      }

  const dayFill = armed ? transitDayBarPercent(nowMs) : 0
  // Belt-and-suspenders: never animate the fast cycle once the next slot is full.
  const cycleArmed =
    armed &&
    Number(params.walletMzn) > 0 &&
    mznFastCycleArmed({
      maxDripZar: params.maxDripZar,
      drippedZar: drip.displayTransitZarOffset,
    })
  const mznBarPercent = cycleArmed ? drip.mznCycleBarPercent : 0
  const zarBookActive =
    Number(params.walletZar) > 0 ||
    Number(params.walletTransitZar) > 0 ||
    drip.displayTransitZarOffset > 0
  const transitBarPercent = zarBookActive ? dayFill : 0

  const nextNine = nextSettleAt09hSastExclusive(nowMs)
  const remainingMs = Math.max(0, nextNine - nowMs)

  return {
    nowMs,
    mznBarPercent,
    transitBarPercent,
    zarBarPercent: transitBarPercent,
    displayMznOffset: drip.displayMznOffset,
    displayTransitZarOffset: drip.displayTransitZarOffset,
    transitCountdownLabel: remainingMs > 0 ? formatCountdown(remainingMs) : '',
  }
}

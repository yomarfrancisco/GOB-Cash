'use client'

import { useEffect, useState } from 'react'
import {
  inventoryBarsArmed,
  nextSettleAt09hSastExclusive,
  transitDayBarPercent,
} from '@/lib/fx/transitDayClock'

export type TransitDayClockView = {
  nowMs: number
  /** Deterministic day fill 0–100 (same on every client for the same wall clock). */
  mznBarPercent: number
  transitBarPercent: number
  zarBarPercent: number
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
 * Shared inventory clock — wall time + wallets only.
 * No session-local drip overlays (those made the same account show different
 * amounts on two tabs). Liquidity figures come from Firestore wallets.
 */
export function useTransitDayClock(params: {
  enabled: boolean
  walletMzn: number
  walletZar?: number
  walletTransitZar?: number
  /** @deprecated kept for call-site compat; ignored */
  sellMznPerZar?: number
  remainingPlannedMzn?: number
}): TransitDayClockView {
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    if (!params.enabled) return
    const tick = () => setNowMs(Date.now())
    tick()
    const id = window.setInterval(tick, 1_000)
    return () => window.clearInterval(id)
  }, [params.enabled])

  const armed = inventoryBarsArmed({
    walletMzn: params.walletMzn,
    walletZar: params.walletZar,
    walletTransitZar: params.walletTransitZar,
  })
  const dayFill = armed ? transitDayBarPercent(nowMs) : 0
  // MZN card bar: day progress toward next 09:00 when MZN is funded.
  const mznBarPercent =
    armed && Number(params.walletMzn) > 0 ? dayFill : 0
  const zarBookActive =
    Number(params.walletZar) > 0 || Number(params.walletTransitZar) > 0
  const transitBarPercent = zarBookActive ? dayFill : 0

  const nextNine = nextSettleAt09hSastExclusive(nowMs)
  const remainingMs = Math.max(0, nextNine - nowMs)

  return {
    nowMs,
    mznBarPercent,
    transitBarPercent,
    zarBarPercent: transitBarPercent,
    transitCountdownLabel: remainingMs > 0 ? formatCountdown(remainingMs) : '',
  }
}

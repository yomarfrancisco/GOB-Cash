'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ZAR_CLEAR_CEREMONY_MS,
  createInitialOverlay,
  inventoryTimeBarPercents,
  lastSettleAt09hSast,
  microDripMzn,
  mznToTransitZar,
  nextSettleAt09hSastExclusive,
  randomMznDripCycleMs,
  resolveZarClearOverlayAction,
  type TransitDayOverlay,
} from '@/lib/fx/transitDayClock'

export type TransitDayClockView = {
  nowMs: number
  overlay: TransitDayOverlay
  mznBarPercent: number
  transitBarPercent: number
  zarBarPercent: number
  displayMznOffset: number
  displayTransitZarOffset: number
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
 * UI-only home clock. Bars stay empty until MZN is funded (or ROUTE already
 * has a book). Fast MZN cycles drip MZN→TRANSIT; TRANSIT day bar runs to 09:00;
 * ZAR fills only during the 09:00 clear ceremony.
 */
export function useTransitDayClock(params: {
  enabled: boolean
  walletMzn: number
  walletZar?: number
  walletTransitZar?: number
  sellMznPerZar: number
  remainingPlannedMzn?: number
}): TransitDayClockView {
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [overlay, setOverlay] = useState<TransitDayOverlay>(() => createInitialOverlay(Date.now()))
  const lastNineHandledRef = useRef(0)
  const walletMznRef = useRef(params.walletMzn)
  const walletTransitRef = useRef(params.walletTransitZar ?? 0)
  const sellRef = useRef(params.sellMznPerZar)
  const plannedRef = useRef(params.remainingPlannedMzn ?? 0)
  walletMznRef.current = params.walletMzn
  walletTransitRef.current = params.walletTransitZar ?? 0
  sellRef.current = params.sellMznPerZar
  plannedRef.current = params.remainingPlannedMzn ?? 0

  // Fresh MZN fund: restart the fast cycle from now (bars were empty before).
  const mznFunded = params.walletMzn > 0
  useEffect(() => {
    if (!params.enabled || !mznFunded) return
    setOverlay((prev) => {
      if (prev.mznDelta > 0 || prev.transitZarDelta > 0 || prev.zarCeremonyActive) return prev
      const t = Date.now()
      return {
        ...prev,
        mznCycleAnchorMs: t,
        mznCycleDurationMs: randomMznDripCycleMs(),
      }
    })
  }, [params.enabled, mznFunded])

  useEffect(() => {
    if (!params.enabled) return

    const tick = () => {
      const t = Date.now()
      setNowMs(t)
      setOverlay((prev) => {
        const funded =
          walletMznRef.current > 0 ||
          walletTransitRef.current > 0 ||
          prev.mznDelta > 0 ||
          prev.transitZarDelta > 0
        // No inventory history yet — keep overlay idle and bars empty.
        if (!funded) {
          if (
            prev.mznDelta === 0 &&
            prev.transitZarDelta === 0 &&
            !prev.zarCeremonyActive
          ) {
            return prev
          }
          return createInitialOverlay(t)
        }

        const lastNine = lastSettleAt09hSast(t)
        const clearAction = resolveZarClearOverlayAction({
          nowMs: t,
          lastNineMs: lastNine,
          lastNineHandledMs: lastNineHandledRef.current,
          transitZarDelta: prev.transitZarDelta,
          zarCeremonyActive: prev.zarCeremonyActive,
        })

        if (clearAction === 'start_ceremony') {
          lastNineHandledRef.current = lastNine
          return {
            ...prev,
            zarCeremonyActive: true,
            zarCeremonyStartMs: t,
          }
        }

        if (clearAction === 'instant_reset') {
          // Missed the live 09:00 window — drop UI drip immediately (no wallet writes).
          lastNineHandledRef.current = lastNine
          return createInitialOverlay(t)
        }

        if (
          prev.zarCeremonyActive &&
          prev.zarCeremonyStartMs != null &&
          t - prev.zarCeremonyStartMs >= ZAR_CLEAR_CEREMONY_MS
        ) {
          // Drop UI drip overlays. ZAR major comes from the daily wallet batch.
          lastNineHandledRef.current = lastNine
          return {
            ...createInitialOverlay(t),
          }
        }

        // MZN drip only while funded MZN remains visible.
        const visibleMzn = Math.max(0, walletMznRef.current - prev.mznDelta)
        if (!(visibleMzn > 0) && !(plannedRef.current > 0)) {
          return prev
        }

        const cycleMs = Math.max(1, prev.mznCycleDurationMs)
        if (!prev.zarCeremonyActive && t - prev.mznCycleAnchorMs >= cycleMs) {
          const remainingPlanned = Math.max(0, plannedRef.current - prev.mznDelta)
          const drip = microDripMzn({
            remainingPlannedMzn: remainingPlanned,
            visibleMzn,
            nowMs: t,
            cycleDurationMs: cycleMs,
          })
          const nextDuration = randomMznDripCycleMs()
          if (!(drip > 0) || drip > visibleMzn + 0.0001) {
            return {
              ...prev,
              mznCycleAnchorMs: t,
              mznCycleDurationMs: nextDuration,
            }
          }
          const zar = mznToTransitZar(drip, sellRef.current)
          return {
            ...prev,
            mznDelta: Math.round((prev.mznDelta + drip) * 100) / 100,
            transitZarDelta: Math.round((prev.transitZarDelta + zar) * 100) / 100,
            mznCycleAnchorMs: t,
            mznCycleDurationMs: nextDuration,
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
  const bars = params.enabled
    ? inventoryTimeBarPercents({
        nowMs,
        walletMzn: params.walletMzn,
        walletZar: params.walletZar,
        walletTransitZar: params.walletTransitZar,
        overlay,
      })
    : { mznBarPercent: 0, transitBarPercent: 0, zarBarPercent: 0 }

  return {
    nowMs,
    overlay,
    mznBarPercent: bars.mznBarPercent,
    transitBarPercent: bars.transitBarPercent,
    zarBarPercent: bars.zarBarPercent,
    displayMznOffset: -overlay.mznDelta,
    displayTransitZarOffset: overlay.transitZarDelta,
    displayZarOffset: overlay.zarMajorDelta,
    transitCountdownLabel: remainingMs > 0 ? formatCountdown(remainingMs) : '',
  }
}

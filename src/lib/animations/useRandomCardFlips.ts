/**
 * Random Card Flips Hook
 * 
 * Animation timing:
 * - CSS transition: 300ms ease (transform, opacity, box-shadow, width, height, left, top)
 * - In-burst spacing: 350ms between flips (default, env override: NEXT_PUBLIC_RANDOM_FLIP_BURST_STEP_MS)
 * 
 * Quiet period and inter-burst intervals (slower defaults):
 * - Quiet period: 30s (env: NEXT_PUBLIC_RANDOM_FLIP_QUIET_MS)
 * - Inter-burst interval: random 3-180s (env: NEXT_PUBLIC_RANDOM_FLIP_MIN_MS / MAX_MS)
 * - Burst size: 1-3 flips (env: NEXT_PUBLIC_RANDOM_FLIP_MIN_COUNT / MAX_COUNT)
 */

import { useEffect, useRef } from 'react'
import type React from 'react'
import type { CardStackHandle } from '@/components/CardStack'
import { useAuthStore } from '@/store/auth'
import { getDemoConfig, RANDOM_FLIP_CONFIG } from '@/lib/demo/demoConfig'

const ENABLED = process.env.NEXT_PUBLIC_ENABLE_RANDOM_CARD_FLIPS === '1'
const FIRST_BURST_DELAY_MS = 1000 // 1 second after cards are visible
const DEBUG_ENABLED = process.env.NEXT_PUBLIC_DEBUG_MAP === 'true' || process.env.NODE_ENV !== 'production'

type FlipController = {
  pause: () => void
  resume: () => void
}

export function useRandomCardFlips(
  ref: React.RefObject<CardStackHandle | null>,
  controllerRef?: React.MutableRefObject<FlipController | null>
) {
  const isAuthed = useAuthStore((state) => state.isAuthed)
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
  
  // Only enabled when demo mode is on AND user is NOT authenticated
  const shouldEnable = ENABLED && isDemoMode && !isAuthed
  
  // Get config based on auth state
  const intensity = getDemoConfig(isAuthed)
  const config = RANDOM_FLIP_CONFIG[intensity]
  
  // Allow env overrides for calm mode (backward compatibility)
  const QUIET_MS = isAuthed && process.env.NEXT_PUBLIC_RANDOM_FLIP_QUIET_MS
    ? Number(process.env.NEXT_PUBLIC_RANDOM_FLIP_QUIET_MS)
    : config.QUIET_MS
  const MIN_MS = isAuthed && process.env.NEXT_PUBLIC_RANDOM_FLIP_MIN_MS
    ? Number(process.env.NEXT_PUBLIC_RANDOM_FLIP_MIN_MS)
    : config.MIN_MS
  const MAX_MS = isAuthed && process.env.NEXT_PUBLIC_RANDOM_FLIP_MAX_MS
    ? Number(process.env.NEXT_PUBLIC_RANDOM_FLIP_MAX_MS)
    : config.MAX_MS
  const MIN_COUNT = isAuthed && process.env.NEXT_PUBLIC_RANDOM_FLIP_MIN_COUNT
    ? Number(process.env.NEXT_PUBLIC_RANDOM_FLIP_MIN_COUNT)
    : config.MIN_COUNT
  const MAX_COUNT = isAuthed && process.env.NEXT_PUBLIC_RANDOM_FLIP_MAX_COUNT
    ? Number(process.env.NEXT_PUBLIC_RANDOM_FLIP_MAX_COUNT)
    : config.MAX_COUNT
  const BURST_STEP_MS = isAuthed && process.env.NEXT_PUBLIC_RANDOM_FLIP_BURST_STEP_MS
    ? Number(process.env.NEXT_PUBLIC_RANDOM_FLIP_BURST_STEP_MS)
    : config.BURST_STEP_MS
  
  // Track if first burst has fired (persists across effect re-runs)
  const hasFiredFirstBurstRef = useRef(false)

  useEffect(() => {
    if (!shouldEnable || !ref?.current) {
      // Early return if not enabled
      return
    }

    // Log effective timings at mount
    console.log(
      `[RandomFlip] intensity=${intensity} quiet=${QUIET_MS}ms interval=${MIN_MS}-${MAX_MS}ms burstStep=${BURST_STEP_MS}ms`
    )

    let aborted = false
    let paused = false
    let bursting = false

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

    const rnd = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min

    const handleVisibility = () => {
      // pause/resume by toggling the aborted flag softly
      if (document.hidden) {
        aborted = true
      } else {
        aborted = false
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)

    // Expose pause/resume via controller ref
    if (controllerRef) {
      controllerRef.current = {
        pause: () => {
          paused = true
        },
        resume: () => {
          paused = false
        },
      }
    }

    // Helper function to execute a burst of card flips
    const startBurst = async () => {
      if (!ref.current || document.hidden || paused || bursting) return
      
      bursting = true
      const flips = rnd(MIN_COUNT, MAX_COUNT)

      for (let i = 0; i < flips; i++) {
        // safety: ensure ref still valid and page visible and not paused
        if (!ref.current || document.hidden || paused) break

        ref.current.cycleNext()

        await sleep(BURST_STEP_MS) // allow CSS transition to finish
      }

      bursting = false
    }

    // Schedule initial burst at 10 seconds (one-time only)
    let firstBurstTimer: NodeJS.Timeout | null = null
    if (!hasFiredFirstBurstRef.current && isDemoMode && !isAuthed) {
      if (DEBUG_ENABLED) {
        console.log('[RANDOM_FLIPS] scheduling initial burst in', FIRST_BURST_DELAY_MS, 'ms')
      }
      
      firstBurstTimer = setTimeout(() => {
        // Re-check conditions before firing
        if (
          !hasFiredFirstBurstRef.current &&
          !isAuthed &&
          process.env.NEXT_PUBLIC_DEMO_MODE === 'true' &&
          ref.current &&
          !document.hidden &&
          !paused
        ) {
          hasFiredFirstBurstRef.current = true
          if (DEBUG_ENABLED) {
            console.log('[RANDOM_FLIPS] fired initial burst')
          }
          startBurst()
        }
      }, FIRST_BURST_DELAY_MS)
    }

    const run = async () => {
      // initial quiet period
      await sleep(QUIET_MS)

      while (ref.current) {
        // if hidden or paused, idle-loop until visible/resumed
        while (document.hidden || paused) {
          await sleep(250)
        }

        // wait a random interval between bursts
        const wait = rnd(MIN_MS, MAX_MS)
        await sleep(wait)

        if (!ref.current) break

        // Check again if paused
        if (paused || document.hidden) continue

        // Execute burst using the shared helper
        await startBurst()
      }
    }

    run()

    return () => {
      aborted = true
      paused = true
      if (firstBurstTimer) {
        clearTimeout(firstBurstTimer)
        firstBurstTimer = null
      }
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [ref, controllerRef, shouldEnable, isAuthed, isDemoMode, intensity, QUIET_MS, MIN_MS, MAX_MS, MIN_COUNT, MAX_COUNT, BURST_STEP_MS])
}


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

import { useEffect } from 'react'
import type React from 'react'
import type { CardStackHandle } from '@/components/CardStack'

const ENABLED = process.env.NEXT_PUBLIC_ENABLE_RANDOM_CARD_FLIPS === '1'
const QUIET_MS = Number(process.env.NEXT_PUBLIC_RANDOM_FLIP_QUIET_MS ?? 30000)
const MIN_MS = Number(process.env.NEXT_PUBLIC_RANDOM_FLIP_MIN_MS ?? 3000)
const MAX_MS = Number(process.env.NEXT_PUBLIC_RANDOM_FLIP_MAX_MS ?? 180000)
const MIN_COUNT = Number(process.env.NEXT_PUBLIC_RANDOM_FLIP_MIN_COUNT ?? 1)
const MAX_COUNT = Number(process.env.NEXT_PUBLIC_RANDOM_FLIP_MAX_COUNT ?? 3)
// Per-flip delay inside a burst (>= CSS animation ~300ms)
const BURST_STEP_MS = Number(process.env.NEXT_PUBLIC_RANDOM_FLIP_BURST_STEP_MS ?? 350)

type FlipController = {
  pause: () => void
  resume: () => void
}

export function useRandomCardFlips(
  ref: React.RefObject<CardStackHandle | null>,
  controllerRef?: React.MutableRefObject<FlipController | null>
) {
  useEffect(() => {
    if (!ENABLED || !ref?.current) return

    // Log effective timings at mount
    console.log(
      `[RandomFlip] quiet=${QUIET_MS}ms interval=${MIN_MS}-${MAX_MS}ms burstStep=${BURST_STEP_MS}ms`
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

        if (bursting) continue // never overlap bursts

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
    }

    run()

    return () => {
      aborted = true
      paused = true
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [ref, controllerRef])
}


'use client'

import { useEffect, useState, useRef } from 'react'

type TwoStageTweenOptions = {
  minVisualDelta?: number
  previewCap?: number
  stageADuration?: number
  stageBDuration?: number
  stageBDelay?: number
  round?: (n: number) => number
}

const MIN_VISUAL_DELTA = 1.0 // percent points
const PREVIEW_CAP = 3.0 // max exaggeration
const STAGE_A_DURATION = 220
const STAGE_B_DURATION = 120
const STAGE_B_DELAY = 40

// Easing function: easeOutCubic
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

export function useTwoStageTween(
  to: number,
  options: TwoStageTweenOptions = {}
): { value: number; isAnimating: boolean } {
  const {
    minVisualDelta = MIN_VISUAL_DELTA,
    previewCap = PREVIEW_CAP,
    stageADuration = STAGE_A_DURATION,
    stageBDuration = STAGE_B_DURATION,
    stageBDelay = STAGE_B_DELAY,
    round = (n) => Math.round(n * 10) / 10,
  } = options

  const [value, setValue] = useState(to)
  const [isAnimating, setIsAnimating] = useState(false)
  const prevValueRef = useRef(to)
  const animationFrameRef = useRef<number | null>(null)
  const stageTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const startTimeRef = useRef<number | null>(null)
  const startValueRef = useRef(to)
  const previewValueRef = useRef<number | null>(null)
  const targetValueRef = useRef(to)
  const currentStageRef = useRef<'A' | 'B' | null>(null)

  useEffect(() => {
    if (to === prevValueRef.current) {
      return
    }

    const prev = prevValueRef.current
    const next = to
    const delta = Math.abs(next - prev)

    // Clear any existing animation
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    if (stageTimeoutRef.current !== null) {
      clearTimeout(stageTimeoutRef.current)
    }

    // Determine if we need two-stage animation
    const needsTwoStage = delta < minVisualDelta && delta > 0

    if (needsTwoStage) {
      // Two-stage: first to preview, then to actual
      const direction = next > prev ? 1 : -1
      const previewDelta = Math.min(minVisualDelta, previewCap)
      const preview = prev + direction * previewDelta
      previewValueRef.current = preview
      targetValueRef.current = next
      startValueRef.current = value
      currentStageRef.current = 'A'
      setIsAnimating(true)

      const animateStageA = (currentTime: number) => {
        if (startTimeRef.current === null) {
          startTimeRef.current = currentTime
        }

        const elapsed = currentTime - startTimeRef.current
        const progress = Math.min(elapsed / stageADuration, 1)
        const easedProgress = easeOutCubic(progress)

        const currentValue = startValueRef.current + (preview - startValueRef.current) * easedProgress
        setValue(round(currentValue))

        if (progress < 1) {
          animationFrameRef.current = requestAnimationFrame(animateStageA)
        } else {
          // Stage A complete, start Stage B after delay
          setValue(round(preview))
          startTimeRef.current = null
          currentStageRef.current = 'B'

          stageTimeoutRef.current = setTimeout(() => {
            startTimeRef.current = null
            animationFrameRef.current = requestAnimationFrame(animateStageB)
          }, stageBDelay)
        }
      }

      const animateStageB = (currentTime: number) => {
        if (startTimeRef.current === null) {
          startTimeRef.current = currentTime
        }

        const elapsed = currentTime - startTimeRef.current
        const progress = Math.min(elapsed / stageBDuration, 1)
        const easedProgress = easeOutCubic(progress)

        const currentValue = preview + (next - preview) * easedProgress
        setValue(round(currentValue))

        if (progress < 1) {
          animationFrameRef.current = requestAnimationFrame(animateStageB)
        } else {
          // Animation complete
          setValue(round(next))
          setIsAnimating(false)
          animationFrameRef.current = null
          startTimeRef.current = null
          currentStageRef.current = null
          previewValueRef.current = null
        }
      }

      startTimeRef.current = null
      animationFrameRef.current = requestAnimationFrame(animateStageA)
    } else {
      // Single-stage: direct to target
      startValueRef.current = value
      targetValueRef.current = next
      currentStageRef.current = 'A'
      setIsAnimating(true)

      const animate = (currentTime: number) => {
        if (startTimeRef.current === null) {
          startTimeRef.current = currentTime
        }

        const elapsed = currentTime - startTimeRef.current
        const progress = Math.min(elapsed / stageADuration, 1)
        const easedProgress = easeOutCubic(progress)

        const currentValue = startValueRef.current + (next - startValueRef.current) * easedProgress
        setValue(round(currentValue))

        if (progress < 1) {
          animationFrameRef.current = requestAnimationFrame(animate)
        } else {
          setValue(round(next))
          setIsAnimating(false)
          animationFrameRef.current = null
          startTimeRef.current = null
          currentStageRef.current = null
        }
      }

      startTimeRef.current = null
      animationFrameRef.current = requestAnimationFrame(animate)
    }

    prevValueRef.current = to

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (stageTimeoutRef.current !== null) {
        clearTimeout(stageTimeoutRef.current)
      }
    }
  }, [to, minVisualDelta, previewCap, stageADuration, stageBDuration, stageBDelay, round, value])

  return { value, isAnimating }
}


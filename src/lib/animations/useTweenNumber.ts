'use client'

import { useEffect, useState, useRef } from 'react'

type TweenOptions = {
  duration?: number
  delay?: number
  easing?: 'easeOutCubic' | 'linear'
  round?: (n: number) => number
}

// Easing function: easeOutCubic
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

export function useTweenNumber(
  to: number,
  options: TweenOptions = {}
): number {
  const {
    duration = 250,
    delay = 0,
    easing = 'easeOutCubic',
    round = (n) => Math.round(n * 100) / 100,
  } = options

  const [value, setValue] = useState(to)
  const prevValueRef = useRef(to)
  const animationFrameRef = useRef<number | null>(null)
  const startTimeRef = useRef<number | null>(null)
  const startValueRef = useRef(to)
  const targetValueRef = useRef(to)
  const delayTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (to === prevValueRef.current) {
      return
    }

    startValueRef.current = value
    targetValueRef.current = to
    prevValueRef.current = to

    // Clear any existing animation
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    if (delayTimeoutRef.current !== null) {
      clearTimeout(delayTimeoutRef.current)
    }

    const animate = (currentTime: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = currentTime
      }

      const elapsed = currentTime - startTimeRef.current
      const progress = Math.min(elapsed / duration, 1)

      let easedProgress = progress
      if (easing === 'easeOutCubic') {
        easedProgress = easeOutCubic(progress)
      }

      const currentValue = startValueRef.current + (targetValueRef.current - startValueRef.current) * easedProgress
      setValue(round(currentValue))

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate)
      } else {
        setValue(round(targetValueRef.current))
        animationFrameRef.current = null
        startTimeRef.current = null
      }
    }

    const startAnimation = () => {
      startTimeRef.current = null
      animationFrameRef.current = requestAnimationFrame(animate)
    }

    if (delay > 0) {
      delayTimeoutRef.current = setTimeout(startAnimation, delay)
    } else {
      startAnimation()
    }

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (delayTimeoutRef.current !== null) {
        clearTimeout(delayTimeoutRef.current)
      }
    }
  }, [to, duration, delay, easing, round, value])

  return value
}


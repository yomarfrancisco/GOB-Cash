'use client'

import { useEffect, useState, useRef } from 'react'
import '@/styles/slot-counter.css'

type FormatResult = { major: string; cents?: string } | string

type Props = {
  value: number | string
  format: (n: number) => FormatResult
  durationMs?: number
  easing?: string
  onDone?: () => void
  onStart?: () => void
  className?: string
  renderMajor?: (major: string) => React.ReactNode
  renderCents?: (cents: string) => React.ReactNode
}

// Easing function: easeOutCubic
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

export default function SlotCounter({
  value,
  format,
  durationMs = 700,
  easing = 'easeOutCubic',
  onDone,
  onStart,
  className = '',
  renderMajor,
  renderCents,
}: Props) {
  const numericValue = typeof value === 'string' ? parseFloat(value) : value
  const [displayValue, setDisplayValue] = useState(numericValue)
  const [isAnimating, setIsAnimating] = useState(false)
  const prevValueRef = useRef(numericValue)
  const animationFrameRef = useRef<number | null>(null)
  const startTimeRef = useRef<number | null>(null)
  const startValueRef = useRef<number>(numericValue)
  const targetValueRef = useRef<number>(numericValue)
  const hasStartedRef = useRef(false)

  useEffect(() => {
    if (numericValue !== prevValueRef.current) {
      startValueRef.current = displayValue
      targetValueRef.current = numericValue
      prevValueRef.current = numericValue
      setIsAnimating(true)
      startTimeRef.current = null
      hasStartedRef.current = false

      const animate = (currentTime: number) => {
        if (startTimeRef.current === null) {
          startTimeRef.current = currentTime
          // Fire onStart callback at the first animation frame
          if (onStart && !hasStartedRef.current) {
            hasStartedRef.current = true
            onStart()
          }
        }

        const elapsed = currentTime - startTimeRef.current
        const progress = Math.min(elapsed / durationMs, 1)

        let easedProgress = progress
        if (easing === 'easeOutCubic') {
          easedProgress = easeOutCubic(progress)
        }

        const currentValue = startValueRef.current + (targetValueRef.current - startValueRef.current) * easedProgress
        setDisplayValue(currentValue)

        if (progress < 1) {
          animationFrameRef.current = requestAnimationFrame(animate)
        } else {
          setDisplayValue(targetValueRef.current)
          setIsAnimating(false)
          if (onDone) {
            onDone()
          }
        }
      }

      animationFrameRef.current = requestAnimationFrame(animate)

      return () => {
        if (animationFrameRef.current !== null) {
          cancelAnimationFrame(animationFrameRef.current)
        }
      }
    }
  }, [numericValue, durationMs, easing, onDone, displayValue])

  const formatted = format(displayValue)
  const isObjectFormat = typeof formatted === 'object' && formatted !== null && 'major' in formatted

  if (isObjectFormat) {
    const { major, cents } = formatted as { major: string; cents?: string }
    return (
      <span className={`slot-counter ${className}`}>
        {renderMajor ? renderMajor(major) : <span className="slot-counter__major">{major}</span>}
        {cents !== undefined && (
          <>
            {/* Dot is rendered by parent via renderCents callback, not here */}
            {renderCents ? renderCents(cents) : (
              <>
                <span className="slot-counter__dot">.</span>
                <span className="slot-counter__cents">{cents}</span>
              </>
            )}
          </>
        )}
      </span>
    )
  }

  return <span className={`slot-counter ${className}`}>{formatted as string}</span>
}


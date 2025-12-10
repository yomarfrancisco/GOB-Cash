'use client'

import { useEffect, useState, useRef } from 'react'
import '@/styles/number-roll.css'

type Props = {
  valueCents: number
  currency?: 'ZAR' | 'USD'
  durationMs?: number
  className?: string
}

export default function NumberRoll({ valueCents, currency = 'ZAR', durationMs = 400, className }: Props) {
  const [displayValue, setDisplayValue] = useState(valueCents)
  const [isAnimating, setIsAnimating] = useState(false)
  const prevValueRef = useRef(valueCents)

  useEffect(() => {
    if (valueCents !== prevValueRef.current) {
      setIsAnimating(true)
      setDisplayValue(valueCents)
      const timer = setTimeout(() => {
        setIsAnimating(false)
      }, durationMs)
      prevValueRef.current = valueCents
      return () => clearTimeout(timer)
    }
  }, [valueCents, durationMs])

  const formatValue = (cents: number): string => {
    const amount = cents / 100
    if (currency === 'USD') {
      // For USD, format without currency symbol (we'll add "USDT" separately)
      return new Intl.NumberFormat('en-ZA', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount)
    }
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  }

  const formatted = formatValue(displayValue)
  const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  if (prefersReducedMotion) {
    // Instant swap for reduced motion
    return (
      <span className={`number-roll ${className || ''}`} aria-label={formatted}>
        {formatted}
      </span>
    )
  }

  // Split into glyphs: digits vs non-digits, tracking digit positions
  const glyphs: Array<{ char: string; isDigit: boolean; digit?: number; digitIndex?: number }> = []
  let digitIndex = 0
  for (let i = 0; i < formatted.length; i++) {
    const char = formatted[i]
    const digit = parseInt(char, 10)
    if (!isNaN(digit)) {
      glyphs.push({ char, isDigit: true, digit, digitIndex: digitIndex++ })
    } else {
      glyphs.push({ char, isDigit: false })
    }
  }

  // Extract digit sequences for comparison (by digit position, not string position)
  const extractDigits = (str: string): number[] => {
    return str.split('').map((c) => parseInt(c, 10)).filter((n) => !isNaN(n))
  }

  const currentDigits = extractDigits(formatted)
  const prevDigits = extractDigits(formatValue(prevValueRef.current))

  return (
    <span className={`number-roll ${isAnimating ? 'number-roll--animating' : ''} ${className || ''}`} aria-label={formatted}>
      {glyphs.map((glyph, idx) => {
        if (!glyph.isDigit) {
          return (
            <span key={idx} className="number-roll__static">
              {glyph.char}
            </span>
          )
        }

        const digit = glyph.digit!
        const digitPos = glyph.digitIndex!
        const prevDigit = prevDigits[digitPos] ?? digit

        return (
          <span key={idx} className="number-roll__digit-wrapper">
            <span
              className="number-roll__digit-column"
              style={
                isAnimating
                  ? {
                      transform: `translate3d(0, -${digit}em, 0)`,
                      transition: `transform ${durationMs}ms cubic-bezier(0.4, 0, 0.2, 1)`,
                    }
                  : {
                      transform: `translate3d(0, -${digit}em, 0)`,
                    }
              }
            >
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((d) => (
                <span key={d} className="number-roll__digit">
                  {d}
                </span>
              ))}
            </span>
          </span>
        )
      })}
    </span>
  )
}

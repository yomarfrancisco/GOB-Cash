'use client'

import { useEffect, useRef, useState } from 'react'
import { highlightDeskText } from '@/lib/desk/highlightDeskText'

type Props = {
  text: string
  animate: boolean
  className?: string
  figureClassName?: string
  /** Bold amounts / key figures inside the text. */
  highlightFigures?: boolean
  /** Characters advanced per tick. */
  charsPerTick?: number
  /** Tick interval in ms. */
  tickMs?: number
  onComplete?: () => void
}

/**
 * Fast but clearly typed reveal. Skips animation when `animate` is false.
 */
export function TypewriterText({
  text,
  animate,
  className,
  figureClassName,
  highlightFigures = false,
  charsPerTick = 4,
  tickMs = 18,
  onComplete,
}: Props) {
  const [displayed, setDisplayed] = useState(animate ? '' : text)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete
  const finishedForRef = useRef<string | null>(animate ? null : text)

  useEffect(() => {
    const finish = () => {
      if (finishedForRef.current === text) return
      finishedForRef.current = text
      onCompleteRef.current?.()
    }

    if (!animate) {
      setDisplayed(text)
      finish()
      return
    }

    let reduced = false
    try {
      reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    } catch {
      reduced = false
    }
    if (reduced) {
      setDisplayed(text)
      finish()
      return
    }

    finishedForRef.current = null
    setDisplayed('')
    let i = 0
    const id = window.setInterval(() => {
      i += charsPerTick
      if (i >= text.length) {
        setDisplayed(text)
        window.clearInterval(id)
        finish()
      } else {
        setDisplayed(text.slice(0, i))
      }
    }, tickMs)

    return () => window.clearInterval(id)
  }, [text, animate, charsPerTick, tickMs])

  const content = highlightFigures ? highlightDeskText(displayed, figureClassName) : displayed

  return (
    <div className={className} aria-label={text}>
      {content}
      {animate && displayed.length < text.length ? (
        <span aria-hidden="true" style={{ opacity: 0.35, marginLeft: 1 }}>
          |
        </span>
      ) : null}
    </div>
  )
}

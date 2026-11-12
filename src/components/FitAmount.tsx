'use client'

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

type Props = {
  text: string // e.g., "R 6 000 000.00"
  maxPx?: number // default 72
  minPx?: number // default 28
  className?: string // for color/weight
  /** Rendered immediately after the amount (e.g. text cursor). */
  suffix?: ReactNode
}

export default function FitAmount({ text, maxPx = 72, minPx = 28, className, suffix }: Props) {
  const boxRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  const [size, setSize] = useState(maxPx)

  const fit = () => {
    const box = boxRef.current
    const span = textRef.current
    if (!box || !span) return

    let s = maxPx

    // start large, shrink until it fits
    span.style.fontSize = s + 'px'
    span.style.whiteSpace = 'nowrap'

    while (s > minPx && span.scrollWidth > box.clientWidth) {
      s -= 1
      span.style.fontSize = s + 'px'
    }

    setSize(s)
  }

  useLayoutEffect(fit, [text, maxPx, minPx])

  useEffect(() => {
    const ro = new ResizeObserver(fit)
    if (boxRef.current) ro.observe(boxRef.current)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={boxRef} className={className} style={{ width: '100%' }}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          maxWidth: '100%',
          fontSize: size,
          lineHeight: 1,
        }}
      >
        <span ref={textRef} style={{ fontSize: '1em', lineHeight: 1, display: 'inline-block' }}>
          {text}
        </span>
        {suffix}
      </span>
    </div>
  )
}

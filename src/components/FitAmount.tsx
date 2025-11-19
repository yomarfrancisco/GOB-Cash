'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'

type Props = {
  text: string // e.g., "R 6 000 000.00"
  maxPx?: number // default 72
  minPx?: number // default 28
  className?: string // for color/weight
}

export default function FitAmount({ text, maxPx = 72, minPx = 28, className }: Props) {
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
      <span ref={textRef} style={{ fontSize: size, lineHeight: 1, display: 'inline-block' }}>
        {text}
      </span>
    </div>
  )
}


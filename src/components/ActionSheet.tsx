'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import Image from 'next/image'
import '@/styles/action-sheet.css'

type SheetSize = 'compact' | 'tall'
type SheetChrome = 'close' | 'grab'

type Props = {
  open: boolean
  title: string
  onClose: () => void
  onOverlayClick?: () => void
  children: React.ReactNode
  className?: string
  size?: SheetSize // default 'compact'
  ariaLabelledBy?: string
  /** close = X button (default); grab = top-centre drag bar (swipe / tap outside to dismiss). */
  chrome?: SheetChrome
}

export default function ActionSheet({
  open,
  title,
  onClose,
  onOverlayClick,
  children,
  className,
  size = 'compact',
  ariaLabelledBy,
  chrome = 'close',
}: Props) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const dragStartY = useRef<number | null>(null)
  const [dragY, setDragY] = useState(0)
  const [isClosing, setIsClosing] = useState(false)
  const [shouldRender, setShouldRender] = useState(false)

  // Open before paint so header/content is present on the first frame.
  // Closing still waits for the slide-down animation.
  useLayoutEffect(() => {
    if (open) {
      setShouldRender(true)
      setIsClosing(false)
    }
  }, [open])

  useEffect(() => {
    if (open || !shouldRender) return
    setIsClosing(true)
    const timer = setTimeout(() => {
      setShouldRender(false)
      setIsClosing(false)
    }, 600) // Match animation duration
    return () => clearTimeout(timer)
  }, [open, shouldRender])

  // lock background scroll while open
  useEffect(() => {
    if (!open && !isClosing) return

    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = prev
      document.documentElement.style.overflow = ''
    }
  }, [open, isClosing])

  // close on ESC
  useEffect(() => {
    if (!open) return

    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open) {
      dragStartY.current = null
      setDragY(0)
    }
  }, [open])

  const onGrabTouchStart = (e: React.TouchEvent) => {
    if (chrome !== 'grab') return
    dragStartY.current = e.touches[0]?.clientY ?? null
  }

  const onGrabTouchMove = (e: React.TouchEvent) => {
    if (chrome !== 'grab' || dragStartY.current == null) return
    const y = e.touches[0]?.clientY ?? dragStartY.current
    setDragY(Math.max(0, y - dragStartY.current))
  }

  const onGrabTouchEnd = () => {
    if (chrome !== 'grab') return
    if (dragY > 96) onClose()
    dragStartY.current = null
    setDragY(0)
  }

  if (!shouldRender) return null

  const showTitle = Boolean(title && title.trim())
  const showClose = chrome === 'close'
  const showGrab = chrome === 'grab'

  return ReactDOM.createPortal(
    <div
      className={`as-root ${isClosing ? 'as-root-closing' : ''}`}
      aria-modal="true"
      role="dialog"
      aria-labelledby={ariaLabelledBy}
    >
      <button
        className="as-overlay"
        aria-label={onOverlayClick ? 'Sign in to continue' : 'Close'}
        onClick={onOverlayClick || onClose}
      />
      <div
        className={`as-sheet as-sheet-${size} ${className || ''} ${isClosing ? 'as-sheet-closing' : ''} ${showGrab ? 'as-sheet--grab' : ''}`}
        ref={sheetRef}
        style={dragY > 0 ? { transform: `translateX(-50%) translateY(${dragY}px)` } : undefined}
      >
        {showGrab ? (
          <div
            className="as-grab"
            onTouchStart={onGrabTouchStart}
            onTouchMove={onGrabTouchMove}
            onTouchEnd={onGrabTouchEnd}
            onTouchCancel={onGrabTouchEnd}
            aria-hidden
          >
            <span className="as-grab-bar" />
          </div>
        ) : null}
        {showTitle && (
          <div className="as-header">
            <h3 className="as-title">{title}</h3>
            {showClose ? (
              <button className="as-close" onClick={onClose} aria-label="Close">
                <Image src="/assets/clear.svg" alt="" width={18} height={18} />
              </button>
            ) : null}
          </div>
        )}
        {!showTitle && showClose ? (
          <button className="as-close-only" onClick={onClose} aria-label="Close">
            <Image src="/assets/clear.svg" alt="" width={18} height={18} />
          </button>
        ) : null}
        <div className="as-body">{children}</div>
      </div>
    </div>,
    document.body
  )
}

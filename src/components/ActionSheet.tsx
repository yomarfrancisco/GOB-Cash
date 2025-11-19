'use client'

import { useEffect, useRef } from 'react'
import ReactDOM from 'react-dom'
import Image from 'next/image'
import '@/styles/action-sheet.css'

type SheetSize = 'compact' | 'tall'

type Props = {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
  className?: string
  size?: SheetSize // default 'compact'
}

export default function ActionSheet({ open, title, onClose, children, className, size = 'compact' }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null)

  // lock background scroll while open
  useEffect(() => {
    if (!open) return

    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = prev
      document.documentElement.style.overflow = ''
    }
  }, [open])

  // close on ESC
  useEffect(() => {
    if (!open) return

    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return ReactDOM.createPortal(
    <div className="as-root" aria-modal="true" role="dialog">
      <button className="as-overlay" aria-label="Close" onClick={onClose} />
      <div className={`as-sheet as-sheet-${size} ${className || ''}`} ref={sheetRef}>
        {title && title.trim() && (
          <div className="as-header">
            <h3 className="as-title">{title}</h3>
            <button className="as-close" onClick={onClose} aria-label="Close">
              <Image src="/assets/clear.svg" alt="" width={18} height={18} />
            </button>
          </div>
        )}
        {(!title || !title.trim()) && (
          <button className="as-close-only" onClick={onClose} aria-label="Close">
            <Image src="/assets/clear.svg" alt="" width={18} height={18} />
          </button>
        )}
        <div className="as-body">{children}</div>
      </div>
    </div>,
    document.body
  )
}


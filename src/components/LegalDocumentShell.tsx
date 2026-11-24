'use client'

import { useEffect, type ReactNode } from 'react'
import { useAuthStore } from '@/store/auth'

/**
 * App shell locks html/body overflow for the mobile frame.
 * Legal docs need a dedicated scrollport and must not sit under open auth sheets.
 */
export default function LegalDocumentShell({ children }: { children: ReactNode }) {
  useEffect(() => {
    const auth = useAuthStore.getState()
    auth.closeAuthEntry()
    auth.closeAuthPassword()
    auth.closePhoneSignup()

    const html = document.documentElement
    const body = document.body
    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      htmlHeight: html.style.height,
      bodyHeight: body.style.height,
      bodyAlign: body.style.alignItems,
      bodyJustify: body.style.justifyContent,
      bodyDisplay: body.style.display,
      bodyPadding: body.style.padding,
    }

    html.style.overflow = 'auto'
    body.style.overflow = 'auto'
    html.style.height = 'auto'
    body.style.height = 'auto'
    body.style.alignItems = 'flex-start'
    body.style.justifyContent = 'flex-start'
    body.style.display = 'block'
    body.style.padding = '0'

    return () => {
      html.style.overflow = prev.htmlOverflow
      body.style.overflow = prev.bodyOverflow
      html.style.height = prev.htmlHeight
      body.style.height = prev.bodyHeight
      body.style.alignItems = prev.bodyAlign
      body.style.justifyContent = prev.bodyJustify
      body.style.display = prev.bodyDisplay
      body.style.padding = prev.bodyPadding
    }
  }, [])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 20,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'contain',
        background: '#fff',
      }}
    >
      {children}
    </div>
  )
}

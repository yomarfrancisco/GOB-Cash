'use client'

import { useEffect, useState } from 'react'
import SplashScreenOverlay from '@/components/SplashScreenOverlay'

export default function SplashOnceProvider({ children }: { children: React.ReactNode }) {
  const [showSplash, setShowSplash] = useState(false)

  useEffect(() => {
    try {
      const seen = sessionStorage.getItem('gob_splash_shown')
      if (!seen) {
        setShowSplash(true)
        sessionStorage.setItem('gob_splash_shown', '1')
        const t = setTimeout(() => setShowSplash(false), 4000)
        return () => clearTimeout(t)
      }
    } catch {
      // Ignore sessionStorage errors (e.g., in private browsing)
    }
  }, [])

  return (
    <>
      {children}
      {showSplash && <SplashScreenOverlay />}
    </>
  )
}


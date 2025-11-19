'use client'

import { useEffect, useState } from 'react'
import SplashScreenOverlay from '@/components/SplashScreenOverlay'

export default function SplashOnceProvider({ children }: { children: React.ReactNode }) {
  const [showSplash, setShowSplash] = useState(true)

  useEffect(() => {
    // Always show splash for 4 seconds on initial load
    const t = setTimeout(() => setShowSplash(false), 4000)
    return () => clearTimeout(t)
  }, [])

  return (
    <>
      {children}
      {showSplash && <SplashScreenOverlay />}
    </>
  )
}


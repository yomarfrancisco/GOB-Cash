/**
 * Hook to capture phone resolution signals (geo, timezone, locale, IP)
 * 
 * Captures signals pre-auth for phone number resolution.
 */

'use client'

import { useState, useEffect } from 'react'
import type { ResolverSignals, CountryISO2 } from '@/lib/phone/resolveSadcPhone'

export function usePhoneSignals(): ResolverSignals | null {
  const [signals, setSignals] = useState<ResolverSignals | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Capture timezone
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

    // Capture locale
    const locale = navigator.language

    // Capture geo (if already granted for map)
    // Don't prompt just for auth - only use if already available
    let geo: { lat: number; lng: number; accuracyM?: number } | null = null
    
    // Try to get from sessionStorage if user previously granted location
    try {
      const storedGeo = sessionStorage.getItem('gobankless:lastGeo')
      if (storedGeo) {
        const parsed = JSON.parse(storedGeo)
        if (parsed.lat && parsed.lng) {
          geo = {
            lat: parsed.lat,
            lng: parsed.lng,
            accuracyM: parsed.accuracyM,
          }
        }
      }
    } catch {
      // Ignore storage errors
    }

    // IP country (optional - will be fetched separately if needed)
    let ipCountry: CountryISO2 | null = null

    // Set initial signals (without IP country for now)
    setSignals({
      rawInput: '',
      digitsOnly: '',
      geo,
      timezone,
      locale,
      ipCountry,
    })

    // Optionally fetch IP country (non-blocking)
    fetch('/api/ip-country')
      .then(res => res.json())
      .then(data => {
        if (data.country) {
          setSignals(prev => prev ? { ...prev, ipCountry: data.country } : null)
        }
      })
      .catch(() => {
        // Ignore IP country fetch errors
      })
  }, [])

  return signals
}


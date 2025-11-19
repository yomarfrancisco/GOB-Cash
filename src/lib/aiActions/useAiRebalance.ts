'use client'

import { useEffect, useRef, useCallback } from 'react'
import type { WalletAlloc } from '@/state/walletAlloc'

export type AiAction = {
  from: 'cash' | 'eth' | 'pepe'
  to: 'cash' | 'eth' | 'pepe'
  cents: number
}

type ActionCallback = (action: AiAction) => void

// Health levels for demo logic
type HealthLevel = 'good' | 'moderate' | 'fragile'

const HEALTH_LEVELS: Record<'pepe' | 'eth' | 'cash', HealthLevel> = {
  pepe: 'fragile', // demo: pepe is fragile
  eth: 'moderate',
  cash: 'good',
}

export function useAiRebalance(alloc: WalletAlloc) {
  const callbacksRef = useRef<Set<ActionCallback>>(new Set())
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const isRunningRef = useRef(false)

  const onAction = useCallback((cb: ActionCallback) => {
    callbacksRef.current.add(cb)
    return () => {
      callbacksRef.current.delete(cb)
    }
  }, [])

  const generateAction = useCallback((): AiAction | null => {
    const total = alloc.totalCents
    const pepePct = (alloc.pepeCents / total) * 100
    const ethPct = (alloc.ethCents / total) * 100
    const cashPct = (alloc.cashCents / total) * 100

    // Rule: If pepe health is fragile and allocation > 5%, move to cash
    if (HEALTH_LEVELS.pepe === 'fragile' && pepePct > 5) {
      const movePct = 2 + Math.random() * 4 // 2-6% of total
      const cents = Math.round((total * movePct) / 100)
      if (alloc.pepeCents >= cents) {
        return { from: 'pepe', to: 'cash', cents }
      }
    }

    // Occasionally move from cash to eth or pepe (1-3% of total)
    if (cashPct > 50 && Math.random() < 0.3) {
      const movePct = 1 + Math.random() * 2 // 1-3% of total
      const cents = Math.round((total * movePct) / 100)
      if (alloc.cashCents >= cents) {
        const target = Math.random() < 0.5 ? 'eth' : 'pepe'
        return { from: 'cash', to: target, cents }
      }
    }

    return null
  }, [alloc])

  const emitAction = useCallback(() => {
    const action = generateAction()
    if (action) {
      callbacksRef.current.forEach((cb) => cb(action))
    }
  }, [generateAction])

  const start = useCallback(() => {
    if (isRunningRef.current) return
    isRunningRef.current = true

    const scheduleNext = () => {
      const delay = 8000 + Math.random() * 7000 // 8-15s randomized
      intervalRef.current = setTimeout(() => {
        if (isRunningRef.current) {
          emitAction()
          scheduleNext()
        }
      }, delay)
    }

    scheduleNext()
  }, [emitAction])

  const stop = useCallback(() => {
    isRunningRef.current = false
    if (intervalRef.current) {
      clearTimeout(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      stop()
    }
  }, [stop])

  return {
    onAction,
    start,
    stop,
    nextAction: generateAction,
  }
}


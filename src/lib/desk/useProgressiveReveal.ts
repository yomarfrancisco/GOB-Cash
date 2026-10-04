'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export type RevealItem = { id: string; createdAt: number }

export type ProgressiveRevealState = {
  /** Item ids that may render (history + settled + currently typing). */
  visibleIds: Set<string>
  /** Id currently typewriting, if any. */
  typingId: string | null
  /** Show loading-dots after the last visible bubble. */
  showDots: boolean
  /** True once this id finished its entrance (actions may unlock). */
  isSettled: (id: string) => boolean
  /** Call when the active bubble finishes typing. */
  onTypingComplete: (id: string) => void
}

const DOTS_MS = 520
const BETWEEN_MS = 180
/** On hard refresh / first desk open, replay this window so the user catches up. */
export const DESK_CATCHUP_MS = 24 * 60 * 60 * 1000

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** One catch-up replay per page load (close/reopen sheet does not re-play). */
let catchupConsumedForPageLoad = false

/**
 * Reveal desk bubbles one at a time: dots → typewriter → next.
 * First snapshot settles anything older than 24h; the last day replays as catch-up.
 * Older pagination (createdAt at or below the seed watermark) settles instantly.
 */
export function useProgressiveReveal(items: RevealItem[]): ProgressiveRevealState {
  const [settled, setSettled] = useState<Set<string>>(() => new Set())
  const [typingId, setTypingId] = useState<string | null>(null)
  const [showDots, setShowDots] = useState(false)

  const seededRef = useRef(false)
  const seedMaxCreatedAtRef = useRef(0)
  const settledRef = useRef<Set<string>>(new Set())
  const typingRef = useRef<string | null>(null)
  const queueRef = useRef<string[]>([])
  const busyRef = useRef(false)
  const timersRef = useRef<number[]>([])
  const signature = items.map((row) => row.id).join('|')

  const clearTimers = () => {
    for (const id of timersRef.current) window.clearTimeout(id)
    timersRef.current = []
  }

  const pump = useCallback(() => {
    if (busyRef.current) return
    const next = queueRef.current[0]
    if (!next) {
      setShowDots(false)
      setTypingId(null)
      typingRef.current = null
      return
    }
    busyRef.current = true
    typingRef.current = null
    setTypingId(null)
    setShowDots(true)
    const delay = prefersReducedMotion() ? 0 : DOTS_MS
    const dotsTimer = window.setTimeout(() => {
      setShowDots(false)
      typingRef.current = next
      setTypingId(next)
    }, delay)
    timersRef.current.push(dotsTimer)
  }, [])

  useEffect(() => {
    if (!items.length && !seededRef.current) return

    if (!seededRef.current) {
      seededRef.current = true
      const cutoff = Date.now() - DESK_CATCHUP_MS
      const history = items.filter((row) => (row.createdAt || 0) < cutoff)
      const catchup = items
        .filter((row) => (row.createdAt || 0) >= cutoff)
        .sort((a, b) => a.createdAt - b.createdAt)

      const seed = new Set(history.map((row) => row.id))
      seedMaxCreatedAtRef.current = history.reduce(
        (max, row) => Math.max(max, row.createdAt || 0),
        cutoff - 1
      )

      const skipCatchup = catchupConsumedForPageLoad || prefersReducedMotion() || !catchup.length
      if (skipCatchup) {
        for (const row of catchup) seed.add(row.id)
        seedMaxCreatedAtRef.current = items.reduce(
          (max, row) => Math.max(max, row.createdAt || 0),
          seedMaxCreatedAtRef.current
        )
        settledRef.current = seed
        setSettled(seed)
        return
      }

      catchupConsumedForPageLoad = true
      settledRef.current = seed
      setSettled(seed)
      queueRef.current.push(...catchup.map((row) => row.id))
      pump()
      return
    }

    const known = new Set<string>(Array.from(settledRef.current).concat(queueRef.current))
    if (typingRef.current) known.add(typingRef.current)
    const fresh = items.filter((row) => !known.has(row.id))
    if (!fresh.length) return

    const history = fresh.filter((row) => (row.createdAt || 0) <= seedMaxCreatedAtRef.current)
    const newcomers = fresh
      .filter((row) => (row.createdAt || 0) > seedMaxCreatedAtRef.current)
      .sort((a, b) => a.createdAt - b.createdAt)

    if (history.length) {
      for (const row of history) settledRef.current.add(row.id)
      setSettled(new Set(settledRef.current))
    }

    if (!newcomers.length) return

    if (prefersReducedMotion()) {
      for (const row of newcomers) settledRef.current.add(row.id)
      setSettled(new Set(settledRef.current))
      return
    }

    queueRef.current.push(...newcomers.map((row) => row.id))
    pump()
  }, [signature, items, pump])

  useEffect(() => () => clearTimers(), [])

  const onTypingComplete = useCallback(
    (id: string) => {
      if (typingRef.current !== id) return
      queueRef.current = queueRef.current.filter((row) => row !== id)
      settledRef.current.add(id)
      seedMaxCreatedAtRef.current = Math.max(seedMaxCreatedAtRef.current, Date.now())
      setSettled(new Set(settledRef.current))
      typingRef.current = null
      setTypingId(null)
      const pause = window.setTimeout(() => {
        busyRef.current = false
        pump()
      }, prefersReducedMotion() ? 0 : BETWEEN_MS)
      timersRef.current.push(pause)
    },
    [pump]
  )

  const visibleIds = useMemo(() => {
    const next = new Set(settled)
    if (typingId) next.add(typingId)
    return next
  }, [settled, typingId])

  const isSettled = useCallback((id: string) => settledRef.current.has(id), [settled])

  return {
    visibleIds,
    typingId,
    showDots,
    isSettled,
    onTypingComplete,
  }
}

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isDeskRevealHeld, onDeskRevealRelease } from '@/lib/desk/deskRevealGate'

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
  /** True while a live newcomer queue is draining (dots / typewriter). */
  catchupActive: boolean
}

const DOTS_MS = 520
const BETWEEN_MS = 180
/** Page the last day of history into the first desk window (no replay animation). */
export const DESK_CATCHUP_MS = 24 * 60 * 60 * 1000

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

type SharedReveal = {
  seeded: boolean
  catchupActive: boolean
  settled: Set<string>
  queue: string[]
  seedMaxCreatedAt: number
  typingId: string | null
  busy: boolean
}

/** Survives desk sheet unmount while the keypad is open mid reveal. */
let shared: SharedReveal | null = null

function ensureShared(): SharedReveal {
  if (!shared) {
    shared = {
      seeded: false,
      catchupActive: false,
      settled: new Set(),
      queue: [],
      seedMaxCreatedAt: 0,
      typingId: null,
      busy: false,
    }
  }
  return shared
}

/** After Planned → live restore, re-seed from the live feed only. */
export function resetDeskRevealForLiveRestore(): void {
  shared = null
}

/**
 * First snapshot settles instantly (Next 24 owns the replay).
 * Live newcomers still reveal one at a time: dots → typewriter → next.
 * Older pagination (createdAt at or below the seed watermark) settles instantly.
 */
export function useProgressiveReveal(items: RevealItem[]): ProgressiveRevealState {
  const page = ensureShared()
  const [settled, setSettled] = useState<Set<string>>(() => new Set(page.settled))
  const [typingId, setTypingId] = useState<string | null>(() => page.typingId)
  const [showDots, setShowDots] = useState(false)
  const [catchupActive, setCatchupActive] = useState(() => page.catchupActive)

  const seededRef = useRef(page.seeded)
  const seedMaxCreatedAtRef = useRef(page.seedMaxCreatedAt)
  const settledRef = useRef<Set<string>>(page.settled)
  const typingRef = useRef<string | null>(page.typingId)
  const queueRef = useRef<string[]>(page.queue)
  const busyRef = useRef(page.busy)
  const timersRef = useRef<number[]>([])
  const signature = items.map((row) => row.id).join('|')

  const persist = useCallback(() => {
    const s = ensureShared()
    s.seeded = seededRef.current
    s.settled = settledRef.current
    s.queue = queueRef.current
    s.seedMaxCreatedAt = seedMaxCreatedAtRef.current
    s.typingId = typingRef.current
    s.busy = busyRef.current
    s.catchupActive =
      queueRef.current.length > 0 || Boolean(typingRef.current) || s.catchupActive
    if (!queueRef.current.length && !typingRef.current) {
      s.catchupActive = false
    }
  }, [])

  const clearTimers = () => {
    for (const id of timersRef.current) window.clearTimeout(id)
    timersRef.current = []
  }

  const pump = useCallback(() => {
    if (busyRef.current || isDeskRevealHeld()) return
    const next = queueRef.current[0]
    if (!next) {
      setShowDots(false)
      setTypingId(null)
      typingRef.current = null
      busyRef.current = false
      const s = ensureShared()
      s.catchupActive = false
      setCatchupActive(false)
      persist()
      return
    }
    busyRef.current = true
    typingRef.current = null
    setTypingId(null)
    setShowDots(true)
    setCatchupActive(true)
    const delay = prefersReducedMotion() ? 0 : DOTS_MS
    const dotsTimer = window.setTimeout(() => {
      // Keypad hold must not wedge the pump (busy stuck + no typingId).
      if (isDeskRevealHeld()) {
        busyRef.current = false
        setShowDots(false)
        persist()
        return
      }
      setShowDots(false)
      typingRef.current = next
      setTypingId(next)
      persist()
    }, delay)
    timersRef.current.push(dotsTimer)
    persist()
  }, [persist])

  useEffect(() => {
    return onDeskRevealRelease(() => {
      if (!typingRef.current) {
        busyRef.current = false
      }
      pump()
    })
  }, [pump])

  // Remount after keypad: adopt shared queue/settled before processing fresh items.
  useEffect(() => {
    const s = ensureShared()
    if (!s.seeded) return
    seededRef.current = true
    settledRef.current = s.settled
    queueRef.current = s.queue
    seedMaxCreatedAtRef.current = s.seedMaxCreatedAt
    typingRef.current = s.typingId
    busyRef.current = s.busy
    setSettled(new Set(s.settled))
    setTypingId(s.typingId)
    setCatchupActive(s.catchupActive)
    const tryPump = () => {
      if (!isDeskRevealHeld() && queueRef.current.length && !typingRef.current) {
        busyRef.current = false
        pump()
      }
    }
    tryPump()
    // submitRoutingConversion releases the hold ~40ms after the desk remounts.
    const retry = window.setTimeout(tryPump, 80)
    return () => window.clearTimeout(retry)
    // Intentionally mount-only — shared is the source of truth across desk close/open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!items.length && !seededRef.current) return

    if (!seededRef.current) {
      seededRef.current = true
      const seed = new Set(items.map((row) => row.id))
      seedMaxCreatedAtRef.current = items.reduce(
        (max, row) => Math.max(max, row.createdAt || 0),
        0
      )
      const s = ensureShared()
      settledRef.current = seed
      setSettled(seed)
      s.catchupActive = false
      setCatchupActive(false)
      persist()
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

    if (!newcomers.length) {
      persist()
      return
    }

    if (prefersReducedMotion()) {
      for (const row of newcomers) settledRef.current.add(row.id)
      setSettled(new Set(settledRef.current))
      persist()
      return
    }

    queueRef.current.push(...newcomers.map((row) => row.id))
    persist()
    pump()
  }, [signature, items, pump, persist])

  useEffect(() => {
    return () => {
      clearTimers()
      persist()
    }
  }, [persist])

  const onTypingComplete = useCallback(
    (id: string) => {
      if (typingRef.current !== id) return
      queueRef.current = queueRef.current.filter((row) => row !== id)
      settledRef.current.add(id)
      seedMaxCreatedAtRef.current = Math.max(seedMaxCreatedAtRef.current, Date.now())
      setSettled(new Set(settledRef.current))
      typingRef.current = null
      setTypingId(null)
      persist()
      const pause = window.setTimeout(() => {
        if (isDeskRevealHeld()) {
          // Keep busy so pump does not race the keypad; releaseDeskReveal will continue.
          return
        }
        busyRef.current = false
        pump()
      }, prefersReducedMotion() ? 0 : BETWEEN_MS)
      timersRef.current.push(pause)
    },
    [persist, pump]
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
    catchupActive,
  }
}

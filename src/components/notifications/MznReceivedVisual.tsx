'use client'

import { useEffect, useRef, useState } from 'react'
import type { ActivityItem } from '@/store/activity'
import { MZN_PER_ZAR, mznToZar, sellMznPerZar } from '@/lib/mznZar'
import {
  formatDeskMajorMzn,
  formatDeskMajorZar,
  formatDeskRateMtPerZar,
} from '@/lib/desk/deskMoneyFormat'
import styles from './MznReceivedVisual.module.css'

const ANIM_MS = 2400

function parseMajor(raw: string | undefined | null): number | null {
  if (!raw) return null
  const n = Number(String(raw).replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

export function isMznReceivedNotice(item: ActivityItem): boolean {
  if (typeof item.id === 'string' && item.id.startsWith('mzn-recv-day-')) return true
  if (item.routingAction !== 'bank_notice') return false
  return /^MZN received$/i.test(String(item.title || item.dropdownTitle || ''))
}

function resolveTotalMzn(item: ActivityItem): number {
  if (typeof item.amount?.value === 'number' && item.amount.value > 0) {
    return Math.abs(item.amount.value)
  }
  const totalRow = item.deskLedgerRows?.find((row) => /^Total today$/i.test(row.label))
  const fromTotal = parseMajor(totalRow?.value)
  if (fromTotal && fromTotal > 0) return fromTotal
  const sum = (item.deskLedgerRows || []).reduce((acc, row) => {
    if (/^Total today$/i.test(row.label)) return acc
    const n = parseMajor(row.value)
    return acc + (n && n > 0 ? n : 0)
  }, 0)
  return sum > 0 ? Math.round(sum * 100) / 100 : 0
}

/**
 * Daily Moza credit: ID-1 MZN card that counts up to today's received total
 * (replaces the transfer ledger table). Same casing as “What lands on your card”.
 */
export function MznReceivedVisual({
  item,
  sellMznPerZar: sellMid = null,
}: {
  item: ActivityItem
  sellMznPerZar?: number | null
}) {
  const totalMzn = resolveTotalMzn(item)
  const liveSell =
    typeof sellMid === 'number' && sellMid > 0 ? sellMznPerZar(sellMid) : sellMznPerZar(MZN_PER_ZAR)
  const totalZar = mznToZar(totalMzn, liveSell)

  const rootRef = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const node = rootRef.current
    if (!node || typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true)
          obs.disconnect()
        }
      },
      { threshold: 0.35 }
    )
    obs.observe(node)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (!inView || !(totalMzn > 0)) {
      setProgress(totalMzn > 0 ? 0 : 1)
      return
    }
    let frame = 0
    const started = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / ANIM_MS)
      const eased = 1 - Math.pow(1 - t, 3)
      setProgress(eased)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [inView, totalMzn, item.id])

  const shownMzn = totalMzn * progress
  const shownZar = totalZar * progress
  const fillPct = Math.max(0, Math.min(100, progress * 100))

  return (
    <div className={styles.root} ref={rootRef} aria-label="MZN received today">
      <section className={styles.watch} aria-label="What landed on your card">
        <h3 className={styles.watchTitle}>What landed on your card</h3>
        <div className={styles.miniCard} aria-hidden>
          <div className={styles.lane}>MZN</div>
          <div className={styles.amt}>{formatDeskMajorMzn(shownMzn)}</div>
          <div className={styles.approx}>≈ {formatDeskMajorZar(shownZar)}</div>
          <span className={styles.ratePill}>{formatDeskRateMtPerZar(liveSell)}</span>
          <span
            className={styles.liqTrack}
            title="Received today"
            role="img"
            aria-label={`Received ${Math.round(fillPct)} percent of today’s total`}
          >
            <span className={styles.liqFill} style={{ width: `${fillPct}%` }} />
          </span>
        </div>
        <p className={styles.explain}>
          <span className={styles.explainIcon} aria-hidden>
            <span className={styles.explainIconBar} />
          </span>
          <span>
            Today’s Moza credits count up on your <strong>MZN card</strong>. Converting to rand
            next.
          </span>
        </p>
      </section>
    </div>
  )
}

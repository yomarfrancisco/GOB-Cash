'use client'

import { useEffect, useState } from 'react'
import type { ActivityItem } from '@/store/activity'
import styles from './LiquidNowConvertVisual.module.css'

const ANIM_MS = 2200

function parseMajor(raw: string | undefined | null): number | null {
  if (!raw) return null
  const cleaned = String(raw).replace(/[^\d.-]/g, '')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function fmtMzn(n: number): string {
  return `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MZN`
}

function fmtZar(n: number): string {
  return `R${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function resolveLiquidNowFigures(item: ActivityItem): {
  mznIn: number
  zarOut: number
  rate: number
} {
  const rows = item.deskLedgerRows || []
  const received =
    parseMajor(rows.find((row) => /^received$/i.test(row.label))?.value) ??
    parseMajor(item.deskPipes?.find((pipe) => pipe.tone === 'mzn')?.subtitle) ??
    null
  const liquid =
    parseMajor(rows.find((row) => /liquid\s*zar/i.test(row.label))?.value) ??
    (typeof item.amount?.value === 'number' ? item.amount.value : null) ??
    parseMajor(item.deskPipes?.find((pipe) => pipe.tone === 'zar')?.title) ??
    null
  const rateFromRow = parseMajor(rows.find((row) => /^rate$/i.test(row.label))?.value)
  const rate =
    rateFromRow && rateFromRow > 0
      ? rateFromRow
      : received && liquid && liquid > 0
        ? received / liquid
        : 4.47
  const mznIn =
    received && received > 0
      ? received
      : liquid && rate > 0
        ? Math.round(liquid * rate * 100) / 100
        : 90_000
  const zarOut = liquid && liquid > 0 ? liquid : Math.round((mznIn / rate) * 100) / 100
  return { mznIn, zarOut, rate }
}

/**
 * Stacked full-size MZN → ZAR convert visual for Liquid now.
 * Replays on every mount so historic desk cards get the same animation.
 */
export function LiquidNowConvertVisual({ item }: { item: ActivityItem }) {
  const { mznIn, zarOut, rate } = resolveLiquidNowFigures(item)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
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
  }, [item.id, mznIn, zarOut])

  const mznNow = mznIn * (1 - progress)
  const zarNow = zarOut * progress
  const zarFillPct = Math.max(0, Math.min(100, progress * 100))

  return (
    <div className={styles.root} aria-label="Conversion to liquid ZAR">
      <div className={[styles.card, styles.cardMzn].join(' ')}>
        <div className={styles.lane}>MZN</div>
        <div className={styles.amt}>{fmtMzn(mznNow)}</div>
        <div className={styles.sub}>
          {fmtMzn(mznIn)} in · all converted
        </div>
        <span className={[styles.barSlot, styles.barSlotEmpty].join(' ')} aria-hidden>
          <span className={styles.barTrack}>
            <span className={styles.barFill} style={{ width: '0%' }} />
          </span>
        </span>
      </div>

      <div className={styles.bridge}>
        <span className={styles.arrow} aria-hidden>
          ↓
        </span>
        <span className={styles.ratePill}>
          converted at {rate.toFixed(4)} MZN/ZAR
        </span>
      </div>

      <div className={[styles.card, styles.cardZar].join(' ')}>
        <div className={styles.lane}>ZAR</div>
        <div className={styles.amt}>{fmtZar(zarNow)}</div>
        <div className={styles.sub}>liquid · ready to pay out</div>
        <span className={[styles.barSlot, styles.barSlotLive].join(' ')} aria-hidden title="Liquidity bar">
          <span className={styles.barTrack}>
            <span className={styles.barFill} style={{ width: `${zarFillPct}%` }} />
          </span>
        </span>
      </div>

      <p className={styles.caption}>Full green bar: everything you sent is liquid.</p>
    </div>
  )
}

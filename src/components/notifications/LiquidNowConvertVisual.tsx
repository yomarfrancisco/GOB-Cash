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

type LiquidMode = 'full' | 'partial' | 'none'

function resolveLiquidNowFigures(item: ActivityItem): {
  mznIn: number
  zarOut: number
  mznResidual: number
  rate: number
  mode: LiquidMode
  fillPct: number
  caption: string
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
  const queued =
    parseMajor(rows.find((row) => /^queued$/i.test(row.label))?.value) ??
    (typeof (item as { mznResidual?: number }).mznResidual === 'number'
      ? (item as { mznResidual?: number }).mznResidual!
      : null)
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
  const zarOut = liquid && liquid > 0 ? liquid : 0
  const mznResidual =
    queued != null && queued >= 0
      ? queued
      : zarOut > 0.005 && rate > 0
        ? Math.max(0, Math.round((mznIn - zarOut * rate) * 100) / 100)
        : mznIn
  const explicitMode = (item as { liquidNowMode?: LiquidMode }).liquidNowMode
  const mode: LiquidMode =
    explicitMode === 'full' || explicitMode === 'partial' || explicitMode === 'none'
      ? explicitMode
      : zarOut <= 0.005
        ? 'none'
        : mznResidual > 0.005
          ? 'partial'
          : 'full'
  const wantZar = rate > 0 ? mznIn / rate : 0
  const fillPct =
    mode === 'full'
      ? 100
      : mode === 'none'
        ? 0
        : wantZar > 0
          ? Math.max(0, Math.min(100, (zarOut / wantZar) * 100))
          : 0
  const caption =
    item.deskPipeCaption ||
    (mode === 'full'
      ? `${fmtMzn(mznIn)} converted at ${rate.toFixed(4)}. Full green bar: everything you sent is liquid.`
      : mode === 'partial'
        ? `${fmtZar(zarOut)} liquid now · ${fmtMzn(mznResidual)} ready 09:00 tomorrow.`
        : `No instant liquidity today · ${fmtMzn(mznResidual)} ready 09:00 tomorrow.`)
  return { mznIn, zarOut, mznResidual, rate, mode, fillPct, caption }
}

/**
 * Overlapped Liquid now: MZN strip behind, full-size ZAR card in front.
 * full → MZN drains to 0, ZAR fills; partial → MZN ends on residual; none → ZAR stays R0.
 */
export function LiquidNowConvertVisual({ item }: { item: ActivityItem }) {
  const { mznIn, zarOut, mznResidual, mode, fillPct, caption } = resolveLiquidNowFigures(item)
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
  }, [item.id, mznIn, zarOut, mznResidual, mode])

  const mznEnd = mode === 'full' ? 0 : mznResidual
  const mznNow = mznIn + (mznEnd - mznIn) * progress
  const zarNow = zarOut * progress
  const zarFillNow = fillPct * progress
  const mznLaneLabel =
    mode === 'full'
      ? `${fmtMzn(mznNow)} · all converted`
      : mode === 'partial'
        ? `${fmtMzn(mznNow)} · residual queued`
        : `${fmtMzn(mznNow)} · waiting for liquidity`
  const zarSub =
    mode === 'none' ? 'nothing instant today · queued 09:00' : 'liquid · ready to pay out'

  return (
    <div
      className={styles.root}
      aria-label={
        mode === 'none'
          ? 'Queued for next liquidity window'
          : mode === 'partial'
            ? 'Partial conversion to liquid ZAR'
            : 'Conversion to liquid ZAR'
      }
    >
      <div className={styles.stack}>
        <div className={styles.strip}>
          <span className={styles.stripLane}>MZN</span>
          <span className={styles.stripValue}>{mznLaneLabel}</span>
        </div>

        <div className={styles.front}>
          <div className={styles.lane}>ZAR</div>
          <div className={styles.amt}>{fmtZar(zarNow)}</div>
          <div className={styles.sub}>{zarSub}</div>
          <span className={styles.barSlot} aria-hidden title="Liquidity bar">
            <span className={styles.barTrack}>
              <span className={styles.barFill} style={{ width: `${zarFillNow}%` }} />
            </span>
          </span>
        </div>
      </div>

      <p className={styles.caption}>{caption}</p>
    </div>
  )
}

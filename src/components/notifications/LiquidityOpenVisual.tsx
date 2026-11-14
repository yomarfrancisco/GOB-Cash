'use client'

import type { ActivityItem } from '@/store/activity'
import {
  formatDeskMajorMzn,
  formatDeskMajorZar,
  formatDeskRateMtPerZar,
  parseDeskMoneyToken,
} from '@/lib/desk/deskMoneyFormat'
import styles from './LiquidityOpenVisual.module.css'

function parseRate(raw: string | undefined | null): number | null {
  if (!raw) return null
  const match = String(raw).match(/(\d+(?:\.\d+)?)/)
  if (!match) return null
  const n = Number(match[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

function resolveLiquidityOpenFigures(item: ActivityItem): {
  zarLiquid: number
  mznConverted: number
  rate: number | null
} {
  const rows = item.deskLedgerRows || []
  const zarLiquid =
    (typeof item.amount?.value === 'number' && item.amount.value > 0
      ? Math.abs(item.amount.value)
      : null) ??
    parseDeskMoneyToken(rows.find((row) => /^Liquid ZAR$/i.test(row.label))?.value) ??
    0
  const mznConverted =
    parseDeskMoneyToken(rows.find((row) => /^Converted$/i.test(row.label))?.value) ?? 0
  const rate = parseRate(rows.find((row) => /^Rate$/i.test(row.label))?.value)
  return { zarLiquid, mznConverted, rate }
}

/**
 * Liquidity open: MZN peek under a front ZAR card
 * (liquid amount + rate + converted MZN — replaces the ledger table).
 */
export function LiquidityOpenVisual({ item }: { item: ActivityItem }) {
  const { zarLiquid, mznConverted, rate } = resolveLiquidityOpenFigures(item)
  return (
    <div className={styles.root} aria-label="Liquidity open">
      <div className={styles.stack}>
        <div className={[styles.peek, styles.peekMzn].join(' ')} aria-hidden>
          <span className={styles.peekLane}>MZN</span>
          <span className={styles.peekValue}>{formatDeskMajorMzn(mznConverted)}</span>
        </div>
        <div className={styles.front}>
          <div className={styles.frontLane}>ZAR</div>
          <div className={styles.frontAmt}>{formatDeskMajorZar(zarLiquid)}</div>
          <div className={styles.frontSub}>
            {mznConverted > 0
              ? `from ${formatDeskMajorMzn(mznConverted)} · liquid now`
              : 'liquid now'}
          </div>
          {rate != null ? (
            <span className={styles.ratePill}>{formatDeskRateMtPerZar(rate)}</span>
          ) : null}
          <span className={styles.liqTrack} aria-hidden title="Liquidity bar">
            <span className={styles.liqFill} />
          </span>
        </div>
      </div>
    </div>
  )
}

'use client'

import { Check } from 'lucide-react'
import type { ActivityItem } from '@/store/activity'
import { formatDeskMajorMzn, formatDeskMajorZar } from '@/lib/desk/deskMoneyFormat'
import { formatVisibleSast } from '@/lib/routing/routingTime'
import styles from './PaidOutStackVisual.module.css'

function parseMajor(raw: string | undefined | null): number | null {
  if (!raw) return null
  const cleaned = String(raw).replace(/[^\d.-]/g, '')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function resolvePaidOutFigures(item: ActivityItem): {
  zarPaid: number
  mznResidual: number
  bankTag: string
  receivedClock: string
  pipesClear: boolean
} {
  const rows = item.deskLedgerRows || []
  const paid =
    parseMajor(rows.find((row) => /^paid$/i.test(row.label))?.value) ??
    (typeof item.amount?.value === 'number' ? Math.abs(item.amount.value) : null) ??
    0
  const toRow = rows.find((row) => /^to$/i.test(row.label))?.value?.trim()
  const bankPipe = item.deskPipes?.find((pipe) => pipe.tone === 'bank' || pipe.id === 'bank')
  const bankTag = toRow || bankPipe?.title?.trim() || 'Your bank'
  const receivedClock = formatVisibleSast(item.createdAt) || ''
  const mznFromPlan =
    typeof item.routingPlan?.mznResidual === 'number' ? item.routingPlan.mznResidual : null
  const mznFromRow =
    parseMajor(rows.find((row) => /^mzn|residual|converting/i.test(row.label))?.value) ?? null
  const mznPipe = item.deskPipes?.find((pipe) => pipe.tone === 'mzn' || pipe.id === 'mzn')
  const mznFromPipe = parseMajor(mznPipe?.title) ?? parseMajor(mznPipe?.subtitle)
  const mznResidual = mznFromPlan ?? mznFromRow ?? mznFromPipe ?? 0
  const pipesClear = !(mznResidual > 0.005)
  return { zarPaid: paid, mznResidual, bankTag, receivedClock, pipesClear }
}

/** Overlapped MZN → ZAR → bank stack for Paid out. Works on historic cards too. */
export function PaidOutStackVisual({ item }: { item: ActivityItem }) {
  const { zarPaid, mznResidual, bankTag, receivedClock, pipesClear } = resolvePaidOutFigures(item)
  return (
    <div className={styles.root} aria-label="Payout complete">
      <div className={styles.stack}>
        <div className={[styles.strip, styles.stripMzn].join(' ')} aria-hidden>
          <span className={styles.stripLane}>MZN</span>
          <span className={styles.stripValue}>{formatDeskMajorMzn(mznResidual)}</span>
        </div>
        <div className={[styles.strip, styles.stripZar].join(' ')} aria-hidden>
          <span className={styles.stripLane}>ZAR</span>
          <span className={styles.stripValue}>R 0 · all paid out</span>
        </div>
        <div className={styles.front}>
          <div className={styles.frontLane}>Your bank</div>
          <div className={styles.frontAmt}>{formatDeskMajorZar(zarPaid)}</div>
          <div className={styles.frontSub}>
            received{receivedClock ? ` · ${receivedClock}` : ''}
          </div>
          <span className={styles.bankTag}>{bankTag}</span>
          <span className={styles.check} aria-hidden>
            <Check size={18} strokeWidth={2.8} />
          </span>
        </div>
      </div>
      {pipesClear ? (
        <p className={styles.caption}>Pipes clear. Nothing waiting with us.</p>
      ) : null}
    </div>
  )
}

export function paidOutDisplaySentence(item: ActivityItem): string {
  const zar =
    parseMajor(item.deskLedgerRows?.find((row) => /^paid$/i.test(row.label))?.value) ??
    (typeof item.amount?.value === 'number' ? Math.abs(item.amount.value) : null)
  const speed =
    item.deskSentence?.match(/Instant,[^.]*\./)?.[0] ||
    item.deskSentence?.match(/Instant\./)?.[0] ||
    'Instant.'
  if (zar != null && zar > 0) return `${formatDeskMajorZar(zar)} is in your account. ${speed}`
  return item.deskSentence || item.body || ''
}

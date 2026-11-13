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
  mznLeft: number
  bankTag: string
  receivedClock: string
} {
  const rows = item.deskLedgerRows || []
  const paid =
    parseMajor(rows.find((row) => /^paid$/i.test(row.label))?.value) ??
    (typeof item.amount?.value === 'number' ? Math.abs(item.amount.value) : null) ??
    0
  const mznPipe = item.deskPipes?.find((pipe) => pipe.tone === 'mzn' || pipe.id === 'mzn')
  const mznLeft = parseMajor(mznPipe?.title) ?? 0
  const toRow = rows.find((row) => /^to$/i.test(row.label))?.value?.trim()
  const bankPipe = item.deskPipes?.find((pipe) => pipe.tone === 'bank' || pipe.id === 'bank')
  const bankTag =
    String((item as { payoutBankTag?: string }).payoutBankTag || '').trim() ||
    toRow ||
    bankPipe?.title?.trim() ||
    'Your bank'
  const receivedClock = formatVisibleSast(item.createdAt) || ''
  return { zarPaid: paid, mznLeft, bankTag, receivedClock }
}

/**
 * Overlapped inventory stack for Paid out:
 * MZN residual peek → empty ZAR peek → white bank receipt card on top.
 */
export function PaidOutStackVisual({ item }: { item: ActivityItem }) {
  const { zarPaid, mznLeft, bankTag, receivedClock } = resolvePaidOutFigures(item)
  return (
    <div className={styles.root} aria-label="Payout complete">
      <div className={styles.stack}>
        <div className={[styles.peek, styles.peekMzn].join(' ')} aria-hidden>
          <span className={styles.peekLane}>MZN</span>
          <span className={styles.peekValue}>{formatDeskMajorMzn(mznLeft)}</span>
        </div>
        <div className={[styles.peek, styles.peekZar].join(' ')} aria-hidden>
          <span className={styles.peekLane}>ZAR</span>
          <span className={styles.peekValue}>R 0 · all paid out</span>
        </div>
        <div className={styles.front}>
          <div className={styles.frontLane}>Your bank</div>
          <div className={styles.frontAmt}>{formatDeskMajorZar(zarPaid)}</div>
          <div className={styles.frontSub}>
            received{receivedClock ? ` · ${receivedClock}` : ''}
          </div>
          <span className={styles.bankTag}>{bankTag}</span>
          <span className={styles.check} aria-hidden>
            <Check size={16} strokeWidth={2.8} />
          </span>
        </div>
      </div>
    </div>
  )
}

export function paidOutDisplayTitle(item: ActivityItem): string {
  const zar =
    parseMajor(item.deskLedgerRows?.find((row) => /^paid$/i.test(row.label))?.value) ??
    (typeof item.amount?.value === 'number' ? Math.abs(item.amount.value) : null)
  if (zar != null && zar > 0) return `${formatDeskMajorZar(zar)} paid out.`
  return displayDeskPaidTitle(item.title)
}

function displayDeskPaidTitle(title: string | undefined): string {
  const t = String(title || '').trim()
  return t || 'Paid out'
}

/** True for the earliest Paid out in the feed — only that one gets the auto-payout promise. */
export function isFirstPaidOutMessage(
  item: ActivityItem,
  paidOutItems?: ActivityItem[]
): boolean {
  if (!paidOutItems?.length) return true
  const myMs = typeof item.createdAt === 'number' ? item.createdAt : Number.POSITIVE_INFINITY
  for (const other of paidOutItems) {
    if (other.id === item.id) continue
    const otherMs = typeof other.createdAt === 'number' ? other.createdAt : Number.POSITIVE_INFINITY
    if (otherMs < myMs) return false
    if (otherMs === myMs && String(other.id || '') < String(item.id || '')) return false
  }
  return true
}

export function paidOutDisplaySentence(
  item: ActivityItem,
  opts?: { isFirstPaidOut?: boolean }
): string {
  // After the first Paid out, title alone is enough — the auto-payout line gets mechanical.
  if (opts?.isFirstPaidOut === false) return ''
  const bankTag =
    String((item as { payoutBankTag?: string }).payoutBankTag || '').trim() ||
    item.deskLedgerRows?.find((row) => /^to$/i.test(row.label))?.value?.trim() ||
    item.deskPipes?.find((pipe) => pipe.tone === 'bank' || pipe.id === 'bank')?.title?.trim() ||
    ''
  if (bankTag) {
    return `In ${bankTag}. From now on we pay out automatically.`
  }
  return item.deskSentence || item.body || ''
}

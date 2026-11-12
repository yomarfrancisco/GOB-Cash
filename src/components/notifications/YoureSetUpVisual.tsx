'use client'

import { Check } from 'lucide-react'
import type { ActivityItem } from '@/store/activity'
import { formatDeskMajorZar } from '@/lib/desk/deskMoneyFormat'
import styles from './YoureSetUpVisual.module.css'

function bankTagFromItem(item: ActivityItem): string {
  return (
    String((item as { payoutBankTag?: string }).payoutBankTag || '').trim() ||
    item.deskLedgerRows?.find((row) => /^Payout to$/i.test(row.label) || /^to$/i.test(row.label))
      ?.value?.trim() ||
    item.deskPipes?.find((pipe) => pipe.tone === 'bank' || pipe.id === 'bank')?.title?.trim() ||
    ''
  )
}

export function formatYoureSetUpSentence(item: ActivityItem): string {
  const tag = bankTagFromItem(item)
  if (tag) return `Send MZN any time. We pay ${tag} automatically.`
  return 'Send MZN any time. We pay your bank automatically.'
}

function isPaidOutForCumulative(item: ActivityItem): boolean {
  if (item.routingAction === 'payout_confirmed') return true
  if (item.routingAction !== 'daily_liquid_zar_payout') return false
  if (item.payoutScheduled === true) return false
  if (/^scheduled$/i.test(String(item.deskPendingChip || ''))) return false
  return true
}

/** Sum Paid out to this bank with createdAt ≤ asOfMs (snapshot at that You're set up). */
export function sumPaidZarToBankAsOf(
  paidOutItems: ActivityItem[],
  bankTag: string,
  asOfMs: number
): number {
  const tag = bankTag.trim()
  if (!tag || !(asOfMs > 0)) return 0
  let total = 0
  for (const paid of paidOutItems) {
    if (!isPaidOutForCumulative(paid)) continue
    if ((paid.createdAt || 0) > asOfMs) continue
    if (bankTagFromItem(paid) !== tag) continue
    const amt = typeof paid.amount?.value === 'number' ? Math.abs(paid.amount.value) : 0
    if (amt > 0) total += amt
  }
  return Math.round(total * 100) / 100
}

/**
 * Cumulative on a You're set up card = paid to that bank up to this card's time.
 * Do not use a live all-time bank total (that would rewrite historic cards).
 */
export function resolveYoureSetUpCumulativeZar(
  item: ActivityItem,
  paidOutItems?: ActivityItem[]
): number {
  const tag = bankTagFromItem(item)
  const asOfMs = typeof item.createdAt === 'number' && item.createdAt > 0 ? item.createdAt : 0
  if (paidOutItems && tag && asOfMs > 0) {
    const asOf = sumPaidZarToBankAsOf(paidOutItems, tag, asOfMs)
    if (asOf > 0.005) return asOf
  }
  const stored = Number((item as { payoutCumulativeZar?: number }).payoutCumulativeZar)
  if (Number.isFinite(stored) && stored > 0) return stored
  if (typeof item.amount?.value === 'number' && item.amount.value > 0) {
    return Math.abs(item.amount.value)
  }
  return 0
}

/** White bank card: cumulative ZAR paid to this payout account as of this message. */
export function YoureSetUpVisual({
  item,
  cumulativeZar,
}: {
  item: ActivityItem
  cumulativeZar?: number
}) {
  const tag = bankTagFromItem(item) || 'Your bank'
  const total =
    cumulativeZar != null && cumulativeZar > 0 ? cumulativeZar : resolveYoureSetUpCumulativeZar(item)
  return (
    <div className={styles.root} aria-label="Automatic payout set up">
      <section className={styles.watch} aria-label="Paid to this account">
        <h3 className={styles.watchTitle}>Paid to this account</h3>
        <div className={styles.card}>
          <div className={styles.lane}>Your bank</div>
          <div className={styles.amt}>{formatDeskMajorZar(total)}</div>
          <div className={styles.sub}>cumulative · automatic payouts</div>
          <span className={styles.bankTag}>{tag}</span>
          <span className={styles.check} aria-hidden>
            <Check size={16} strokeWidth={2.8} />
          </span>
        </div>
      </section>
    </div>
  )
}

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
    ''
  )
}

export function formatYoureSetUpSentence(item: ActivityItem): string {
  const tag = bankTagFromItem(item)
  if (tag) return `Send MZN any time. We pay ${tag} automatically.`
  return 'Send MZN any time. We pay your bank automatically.'
}

export function resolveYoureSetUpCumulativeZar(
  item: ActivityItem,
  bankTotals?: Map<string, number>
): number {
  const stored = Number((item as { payoutCumulativeZar?: number }).payoutCumulativeZar)
  if (Number.isFinite(stored) && stored > 0) return stored
  const tag = bankTagFromItem(item)
  if (tag && bankTotals?.has(tag)) return bankTotals.get(tag) || 0
  if (typeof item.amount?.value === 'number' && item.amount.value > 0) {
    return Math.abs(item.amount.value)
  }
  return 0
}

/** White bank card: cumulative ZAR paid to this payout account. */
export function YoureSetUpVisual({
  item,
  cumulativeZar,
}: {
  item: ActivityItem
  cumulativeZar?: number
}) {
  const tag = bankTagFromItem(item) || 'Your bank'
  const total = cumulativeZar != null && cumulativeZar > 0 ? cumulativeZar : resolveYoureSetUpCumulativeZar(item)
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

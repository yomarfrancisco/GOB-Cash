'use client'

import { useEffect, useState } from 'react'
import type { ActivityItem } from '@/store/activity'
import { formatDeskMajorZar } from '@/lib/desk/deskMoneyFormat'
import styles from './ScheduledPayoutVisual.module.css'

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function readMs(item: ActivityItem, key: string): number | null {
  const raw = (item as Record<string, unknown>)[key]
  return typeof raw === 'number' && raw > 0 ? raw : null
}

export function isScheduledLiquidPayout(item: ActivityItem): boolean {
  if (item.routingAction !== 'daily_liquid_zar_payout') return false
  if ((item as { payoutScheduled?: boolean }).payoutScheduled === true) return true
  if (/^scheduled$/i.test(String(item.deskPendingChip || ''))) return true
  return false
}

export function isPaidLiquidPayout(item: ActivityItem): boolean {
  if (item.routingAction !== 'daily_liquid_zar_payout') return false
  if (isScheduledLiquidPayout(item)) return false
  return (
    /^paid$/i.test(String(item.deskStatusChip || '')) ||
    /^withdrawn$/i.test(String(item.deskStatusChip || '')) ||
    Boolean(item.deskSentence)
  )
}

/** 09:00→09:15 scheduled sweep: ZAR card + countdown. Change account is shell CTA. */
export function ScheduledPayoutVisual({
  item,
  onChangeAccount,
}: {
  item: ActivityItem
  onChangeAccount?: () => void
}) {
  const amount =
    typeof item.amount?.value === 'number'
      ? Math.abs(item.amount.value)
      : Number(
          String(item.deskLedgerRows?.find((r) => /^liquid$/i.test(r.label))?.value || '')
            .replace(/[^\d.-]/g, '')
        ) || 0
  const liquidAt =
    readMs(item, 'payoutLiquidAtMs') ||
    (typeof item.createdAt === 'number' ? item.createdAt : Date.now())
  const sendAt = readMs(item, 'payoutSendAtMs') || liquidAt + 15 * 60 * 1000

  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [])

  const remaining = Math.max(0, sendAt - nowMs)
  const span = Math.max(1, sendAt - liquidAt)
  const elapsed = Math.min(1, Math.max(0, (nowMs - liquidAt) / span))
  const done = remaining <= 0

  return (
    <div className={styles.root} aria-label="Scheduled payout">
      <section className={styles.watch} aria-label="Liquid ZAR leaving at 09:15">
        <div className={styles.miniCard}>
          <div className={styles.lane}>ZAR</div>
          <div className={styles.amt}>{formatDeskMajorZar(amount)}</div>
          <div className={styles.sub}>
            {done ? 'ready · sending now' : 'ready · leaves at 09:15'}
          </div>
          <span className={styles.liqTrack} aria-hidden title="Liquidity bar">
            <span className={styles.liqFill} />
          </span>
        </div>

        <div className={styles.countdownBlock}>
          <div className={styles.countdownBig} aria-live="polite">
            {done ? '0:00' : formatCountdown(remaining)}
          </div>
          <div
            className={styles.track}
            role="progressbar"
            aria-valuenow={Math.round(elapsed * 100)}
          >
            <span className={styles.fill} style={{ width: `${elapsed * 100}%` }} />
          </div>
        </div>
      </section>

      {onChangeAccount ? (
        <button type="button" className={styles.changeBtn} onClick={onChangeAccount}>
          Change account
        </button>
      ) : null}
    </div>
  )
}

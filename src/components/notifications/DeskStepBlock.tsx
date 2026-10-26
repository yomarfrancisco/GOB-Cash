'use client'

import styles from './DeskStepBlock.module.css'

export type DeskLedgerRow = { label: string; value: string }

export type DeskStepBlockProps = {
  statusSentence?: string
  statusChip?: string
  rows?: DeskLedgerRow[]
  /** When true, status chip is mint and non-interactive. */
  executed?: boolean
}

/**
 * Variant B — Steps 2–5: status sentence + ledger rows.
 * Actions stay in the parent activity action row.
 */
export function DeskStepBlock({
  statusSentence,
  statusChip,
  rows,
  executed,
}: DeskStepBlockProps) {
  const list = (rows || []).slice(0, 6)
  if (!statusSentence && !list.length && !statusChip) return null

  return (
    <div className={styles.wrap}>
      {(statusChip || statusSentence) && (
        <div className={styles.head}>
          {statusSentence ? <p className={styles.status}>{statusSentence}</p> : null}
          {statusChip ? (
            <span
              className={executed ? styles.statusChipDone : styles.statusChipPending}
              aria-hidden
            >
              {executed ? `✓ ${statusChip}` : statusChip}
            </span>
          ) : null}
        </div>
      )}
      {list.length ? (
        <div className={styles.rows}>
          {list.map((row) => (
            <div key={`${row.label}-${row.value}`} className={styles.row}>
              <span className={styles.label}>{row.label}</span>
              <span className={styles.value}>{row.value}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

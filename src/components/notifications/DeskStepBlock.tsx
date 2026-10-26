'use client'

import styles from './DeskStepBlock.module.css'

export type DeskLedgerRow = {
  label: string
  value: string
  valueStrong?: boolean
  secondLine?: string
}

export function DeskStepBlock({ rows }: { rows: DeskLedgerRow[] }) {
  const list = (rows || []).slice(0, 6)
  if (!list.length) return null
  return (
    <div className={styles.card}>
      {list.map((row, index) => (
        <div
          key={`${row.label}-${row.value}-${index}`}
          className={[styles.row, index === list.length - 1 ? styles.rowLast : ''].filter(Boolean).join(' ')}
        >
          <span className={styles.label}>{row.label}</span>
          <div className={styles.valueCol}>
            <span className={row.valueStrong ? styles.valueStrong : styles.value}>{row.value}</span>
            {row.secondLine ? <span className={styles.second}>{row.secondLine}</span> : null}
          </div>
        </div>
      ))}
    </div>
  )
}

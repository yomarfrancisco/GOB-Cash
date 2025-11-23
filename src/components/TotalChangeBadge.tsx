'use client'

import { TriangleUp } from './icons/TriangleUp'
import { TriangleDown } from './icons/TriangleDown'
import styles from './TotalChangeBadge.module.css'

type TotalChangeBadgeProps = {
  pctChange: number
}

export default function TotalChangeBadge({ pctChange }: TotalChangeBadgeProps) {
  // Always show up or down, never neutral (treat 0 as up)
  if (pctChange >= 0) {
    return (
      <div className={styles.totalChange}>
        <TriangleUp size={14} color="#29ff63" />
        <span className={styles.totalChangeUp}>+{pctChange.toFixed(1)}%</span>
      </div>
    )
  }

  // pctChange < 0
  return (
    <div className={styles.totalChange}>
      <TriangleDown size={14} color="#ff4d4d" />
      <span className={styles.totalChangeDown}>{pctChange.toFixed(1)}%</span>
    </div>
  )
}


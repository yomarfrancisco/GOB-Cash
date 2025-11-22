'use client'

import { TriangleUp } from './icons/TriangleUp'
import { TriangleDown } from './icons/TriangleDown'
import styles from './TotalChangeBadge.module.css'

type TotalChangeBadgeProps = {
  pctChange: number
}

export default function TotalChangeBadge({ pctChange }: TotalChangeBadgeProps) {
  if (pctChange > 0) {
    return (
      <div className={styles.totalChange}>
        <TriangleUp size={14} color="#29ff63" />
        <span className={styles.totalChangeUp}>+{pctChange.toFixed(1)}%</span>
      </div>
    )
  }

  if (pctChange < 0) {
    return (
      <div className={styles.totalChange}>
        <TriangleDown size={14} color="#ff4d4d" />
        <span className={styles.totalChangeDown}>{pctChange.toFixed(1)}%</span>
      </div>
    )
  }

  return (
    <div className={styles.totalChange}>
      <span className={styles.neutralDot} />
      <span className={styles.totalChangeFlat}>{pctChange.toFixed(1)}%</span>
    </div>
  )
}


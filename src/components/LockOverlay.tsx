/**
 * LockOverlay - Reusable lock icon overlay for buttons
 * 
 * Renders a lock icon as a superscript overlay on buttons.
 * Positioned absolutely at top-right corner of the parent container.
 */

import { Lock } from 'lucide-react'
import styles from './LockOverlay.module.css'

interface LockOverlayProps {
  /**
   * Whether to show the lock overlay
   */
  show?: boolean
}

export default function LockOverlay({ show = true }: LockOverlayProps) {
  if (!show) return null

  return (
    <div className={styles.lockOverlay}>
      <Lock size={16} strokeWidth={2} />
    </div>
  )
}


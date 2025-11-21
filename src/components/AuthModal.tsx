/**
 * AuthModal - Full-bleed hand artwork background
 * 
 * Shows the hand artwork as a full-bleed background filling the entire ActionSheet.
 * No forms, no buttons - just the artwork as the sheet background.
 * All interactions trigger this single image sheet.
 */

'use client'

import { useAuthStore } from '@/store/auth'
import ActionSheet from './ActionSheet'
import styles from './AuthModal.module.css'

export default function AuthModal() {
  const { authOpen, closeAuth } = useAuthStore()

  if (!authOpen) return null

  return (
    <ActionSheet open={authOpen} onClose={closeAuth} title="" size="tall" className="handAuthSheet">
      <div className={styles.handAuthWrapper}>
        <div className={styles.handAuthRoot} />
      </div>
    </ActionSheet>
  )
}

/**
 * PhoneSignupSheet - Phone sign-up sheet with phone background image
 * 
 * UI-only sheet for phone sign-up flow. Uses sign_up - phone.png background.
 * Same ActionSheet styling as other auth sheets (85vh, rounded top corners).
 */

'use client'

import clsx from 'clsx'
import { useAuthStore } from '@/store/auth'
import ActionSheet from './ActionSheet'
import styles from './AuthModal.module.css'

export default function PhoneSignupSheet() {
  const { phoneSignupOpen, closePhoneSignup } = useAuthStore()

  if (!phoneSignupOpen) return null

  return (
    <ActionSheet 
      open={phoneSignupOpen} 
      onClose={closePhoneSignup} 
      title="" 
      size="tall" 
      className="handAuthSheet phoneSignupSheet"
    >
      <div className={styles.handAuthWrapper}>
        <div className={clsx(styles.handAuthRoot, styles.handAuthRootPhone)} />
        {/* For now, no form/content — just the background and default close button */}
      </div>
    </ActionSheet>
  )
}


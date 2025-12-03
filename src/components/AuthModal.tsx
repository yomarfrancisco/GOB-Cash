/**
 * AuthModal - Full-bleed hand artwork background with password gate
 * 
 * Shows the hand artwork as a full-bleed background with a password form overlay.
 * Validates password against member password and authenticates on success.
 */

'use client'

import { useState } from 'react'
import Image from 'next/image'
import clsx from 'clsx'
import { ArrowUp } from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import ActionSheet from './ActionSheet'
import styles from './AuthModal.module.css'

const MEMBER_PASSWORD = 'brics2025'

export default function AuthModal() {
  const { authPasswordOpen, closeAuthPassword, closeAllAuth, completeAuth } = useAuthStore()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isDisabled = password.trim().length === 0 || isSubmitting

  const handleBackToLogin = () => {
    closeAuthPassword()
    // Small delay to allow password sheet to close before opening login entry
    setTimeout(() => {
      const { openAuthEntryLogin } = useAuthStore.getState()
      openAuthEntryLogin()
    }, 220)
  }

  const handleCloseAll = () => {
    closeAllAuth()
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isDisabled) return

    setError(null)
    setIsSubmitting(true)

    try {
      if (password.trim() !== MEMBER_PASSWORD) {
        setError('Incorrect member password')
        return
      }

      // ✅ Success: mark user as authed and close modal
      completeAuth()
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!authPasswordOpen) return null

  return (
    <ActionSheet open={authPasswordOpen} onClose={handleCloseAll} title="" size="tall" className="handAuthSheet">
      <div className={styles.handAuthWrapper}>
        <div className={styles.handAuthRoot} />
        {/* Back chevron in top-left */}
        <button
          type="button"
          className={styles.passwordBackButton}
          onClick={handleBackToLogin}
          aria-label="Back to login"
        >
          <Image
            src="/assets/back_ui.svg"
            alt="Back"
            width={24}
            height={24}
            unoptimized
          />
        </button>
        <div className={clsx(styles.content, styles.passwordContent)}>
          <form className={clsx(styles.form, styles.passwordForm)} onSubmit={handleSubmit}>
            <label className={styles.field}>
              <div className={clsx(styles.inputShellPill, styles.passwordInputShellPill)}>
                <input
                  type="password"
                  className={styles.inputPill}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setError(null) // Clear error when user types
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isDisabled) {
                      e.preventDefault()
                      handleSubmit(e)
                    }
                  }}
                  placeholder="Password"
                />
                {/* Submit button - appears when there's text */}
                {password.trim().length > 0 && (
                  <button
                    type="button"
                    className={styles.submitButton}
                    onClick={(e) => {
                      e.preventDefault()
                      handleSubmit(e)
                    }}
                    aria-label="Submit"
                  >
                    <ArrowUp className={styles.submitButtonIcon} />
                  </button>
                )}
              </div>
            </label>
            {error && (
              <p className={styles.errorText}>
                {error}
              </p>
            )}
            <p className={styles.legal}>
              Gobankless is a service provider of the National Stokvel Association of
              South Africa, an authorised Financial Services Provider (FSP 52815) and
              Co-operative bank (Certificate no. CFI0024).
            </p>
          </form>
        </div>
      </div>
    </ActionSheet>
  )
}

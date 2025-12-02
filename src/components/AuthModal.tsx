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
import { useAuthStore } from '@/store/auth'
import ActionSheet from './ActionSheet'
import styles from './AuthModal.module.css'

const MEMBER_PASSWORD = 'brics2025'

export default function AuthModal() {
  const { authPasswordOpen, closeAuthPassword, closeAllAuth, completeAuth } = useAuthStore()
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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
        {/* Centered GoBankless logo at top */}
        <div className={styles.passwordLogoWrapper}>
          <Image
            src="/assets/core/gobankless-logo.png"
            alt="GoBankless"
            width={152}
            height={40}
            unoptimized
          />
        </div>
        <div className={styles.content}>
          <form className={styles.form} onSubmit={handleSubmit}>
            <label className={styles.field}>
              <div className={styles.inputShell}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className={styles.input}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setError(null) // Clear error when user types
                  }}
                  placeholder="Password"
                />
                <button
                  type="button"
                  className={styles.eyeButton}
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Image
                    src="/assets/hidden_outlined.svg"
                    alt=""
                    width={24}
                    height={24}
                    className={styles.eyeIcon}
                  />
                </button>
              </div>
            </label>
            {error && (
              <p className={styles.errorText}>
                {error}
              </p>
            )}
            <button
              type="submit"
              className={clsx(styles.primaryButton, {
                [styles.primaryButtonDisabled]: isDisabled,
              })}
              disabled={isDisabled}
            >
              Log in
            </button>
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

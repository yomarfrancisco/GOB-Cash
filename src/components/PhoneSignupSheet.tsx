/**
 * PhoneSignupSheet - Phone sign-up sheet with phone background image
 * 
 * Form sheet for phone sign-up flow. Uses sign_up - phone.png background.
 * Contains username, phone number, and password inputs with "Create a new account" button.
 */

'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import clsx from 'clsx'
import { ArrowUp } from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { useNotificationStore } from '@/store/notifications'
import ActionSheet from './ActionSheet'
import styles from './AuthModal.module.css'

export default function PhoneSignupSheet() {
  const { phoneSignupOpen, closePhoneSignup, closeAllAuth, openAuthEntrySignup } = useAuthStore()
  const { pushNotification } = useNotificationStore()
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const passwordInputRef = useRef<HTMLInputElement>(null)

  const canSubmit = password.trim().length > 0 && !isSubmitting
  const isDisabled = !canSubmit

  // Detect autofill - check periodically if input has value but state doesn't
  useEffect(() => {
    if (!phoneSignupOpen || !passwordInputRef.current) return

    const checkAutofill = () => {
      const input = passwordInputRef.current
      if (input && input.value && !password) {
        setPassword(input.value)
      }
    }

    // Check immediately and after a short delay (autofill happens asynchronously)
    checkAutofill()
    const timeoutId = setTimeout(checkAutofill, 100)
    const intervalId = setInterval(checkAutofill, 300)

    return () => {
      clearTimeout(timeoutId)
      clearInterval(intervalId)
    }
  }, [phoneSignupOpen, password])

  const handleBackToSignupOptions = () => {
    closePhoneSignup()
    // Small delay to allow phone sheet to close before opening signup options
    setTimeout(() => {
      openAuthEntrySignup() // Open entry sheet in signup mode
    }, 220)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isDisabled) return

    setIsSubmitting(true)
    // TODO: wire real sign-up later
    // Note: username and phone are no longer collected here
    // Phone was captured in the previous step, username can be set later
    console.log('Sign up with phone:', { password })
    
    // Show success notification
    pushNotification({
      kind: 'payment_sent', // Using existing kind for now
      title: 'You\'re in. Your wallet is ready.',
      actor: {
        type: 'system',
        id: 'system',
        name: 'System',
      },
    })

    // Close all auth sheets and return to home
    setTimeout(() => {
      closeAllAuth()
      setIsSubmitting(false)
    }, 500)
  }

  const handleGoToLogin = () => {
    closePhoneSignup()
    // Small delay to allow phone sheet to close before opening login entry
    setTimeout(() => {
      const { openAuthEntryLogin } = useAuthStore.getState()
      openAuthEntryLogin()
    }, 220)
  }

  const handleCloseAll = () => {
    closeAllAuth()
  }

  if (!phoneSignupOpen) return null

  return (
    <ActionSheet 
      open={phoneSignupOpen} 
      onClose={handleCloseAll} 
      title="" 
      size="tall" 
      className="handAuthSheet phoneSignupSheet"
    >
      <div className={styles.handAuthWrapper}>
        <div className={styles.handAuthRoot} />
        {/* Back chevron in top-left */}
        <button
          type="button"
          className={styles.passwordBackButton}
          onClick={handleBackToSignupOptions}
          aria-label="Back to sign up options"
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
                  ref={passwordInputRef}
                  type="password"
                  className={styles.inputPill}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onInput={(e) => {
                    // Handle autofill by checking input value
                    const input = e.currentTarget
                    if (input.value !== password) {
                      setPassword(input.value)
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && canSubmit) {
                      e.preventDefault()
                      handleSubmit(e)
                    }
                  }}
                  placeholder="Create a password"
                />
                {/* Submit button - always visible, disabled until password is entered */}
                <button
                  type="button"
                  className={clsx(styles.submitButton, {
                    [styles.submitButtonDisabled]: !canSubmit,
                  })}
                  onClick={canSubmit ? (e) => {
                    e.preventDefault()
                    handleSubmit(e)
                  } : undefined}
                  aria-label="Submit"
                  aria-disabled={!canSubmit}
                >
                  <ArrowUp className={styles.submitButtonIcon} />
                </button>
              </div>
            </label>
            <p className={styles.legal}>
              Gobankless is a service provider of the National Stokvel Association of
              South Africa, an authorised Financial Services Provider (FSP 52815) and
              Co-operative bank (Certificate no. CFI0024).
            </p>
            {/* Already have an account link - positioned below legal text */}
            <p className={styles.switchAuthText}>
              Already have an account?{' '}
              <button
                type="button"
                className={styles.switchAuthLink}
                onClick={handleGoToLogin}
              >
                Log in
              </button>
            </p>
          </form>
        </div>
      </div>
    </ActionSheet>
  )
}


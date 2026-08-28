/**
 * PhoneSignupSheet - Phone sign-up sheet with OTP verification
 * 
 * Form sheet for phone sign-up flow. Uses sign_up - phone.png background.
 * Contains OTP code input for SMS verification.
 */

'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import clsx from 'clsx'
import { ArrowUp } from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { useNotificationStore } from '@/store/notifications'
import { useFirebasePhoneAuth } from '@/hooks/useFirebasePhoneAuth'
import ActionSheet from './ActionSheet'
import styles from './AuthModal.module.css'

export default function PhoneSignupSheet() {
  const { 
    phoneSignupOpen, 
    closePhoneSignup,
    closeAllAuth,
    dismissAuth,
    openAuthEntrySignup,
    phoneSignupPhone,
    phoneConfirmationResult,
    clearPhoneAuth
  } = useAuthStore()
  const { pushNotification } = useNotificationStore()
  const { verifyCode } = useFirebasePhoneAuth()
  const [otpCode, setOtpCode] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const otpInputRef = useRef<HTMLInputElement>(null)

  const canSubmit = otpCode.trim().length === 6 && !isSubmitting && phoneConfirmationResult !== null
  const isDisabled = !canSubmit

  // Detect autofill - check periodically if input has value but state doesn't
  useEffect(() => {
    if (!phoneSignupOpen || !otpInputRef.current) return

    const checkAutofill = () => {
      const input = otpInputRef.current
      if (input && input.value && !otpCode) {
        const numericValue = input.value.replace(/\D/g, '').slice(0, 6)
        setOtpCode(numericValue)
      }
    }

    checkAutofill()
    const timeoutId = setTimeout(checkAutofill, 100)
    const intervalId = setInterval(checkAutofill, 300)

    return () => {
      clearTimeout(timeoutId)
      clearInterval(intervalId)
    }
  }, [phoneSignupOpen, otpCode])

  const handleBackToSignupOptions = () => {
    closePhoneSignup()
    clearPhoneAuth()
    setTimeout(() => {
      openAuthEntrySignup()
    }, 220)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isDisabled || !phoneConfirmationResult) return

    setIsSubmitting(true)

    try {
      await verifyCode(phoneConfirmationResult, otpCode.trim())
      clearPhoneAuth()
      closeAllAuth()
      setIsSubmitting(false)
    } catch (error: any) {
      setIsSubmitting(false)
      
      pushNotification({
        kind: 'payment_failed',
        title: 'Verification failed',
        body: error.message || 'Please try again',
        actor: { type: 'system' },
      })
    }
  }

  const handleGoToLogin = () => {
    closePhoneSignup()
    clearPhoneAuth()
    setTimeout(() => {
      const { openAuthEntryLogin } = useAuthStore.getState()
      openAuthEntryLogin()
    }, 220)
  }

  const handleCloseAll = () => {
    clearPhoneAuth()
    dismissAuth()
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
        <div className={styles.handAuthRootPhone}>
          <Image
            src="/assets/sign_up - phone2.png"
            alt=""
            fill
            quality={92}
            sizes="100vw"
            style={{ objectFit: 'cover', objectPosition: 'center' }}
          />
        </div>
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
            sizes="24px"
            quality={92}
          />
        </button>
        <div className={clsx(styles.content, styles.passwordContent)}>
          <form className={clsx(styles.form, styles.passwordForm)} onSubmit={handleSubmit}>
            <label className={styles.field}>
              <div className={clsx(styles.inputShellPill, styles.passwordInputShellPill)}>
                <input
                  ref={otpInputRef}
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  className={styles.inputPill}
                  value={otpCode}
                  onChange={(e) => {
                    // Only allow digits, max 6
                    const value = e.target.value.replace(/\D/g, '').slice(0, 6)
                    setOtpCode(value)
                  }}
                  onInput={(e) => {
                    const input = e.currentTarget
                    const numericValue = input.value.replace(/\D/g, '').slice(0, 6)
                    if (numericValue !== otpCode) {
                      setOtpCode(numericValue)
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && canSubmit) {
                      e.preventDefault()
                      handleSubmit(e)
                    }
                  }}
                  placeholder="Enter 6-digit code"
                />
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
              Gobankless is a <strong>cash mobility</strong> network and service provider of the National
              Stokvel Association of South Africa, an authorised Financial Services Provider (FSP 52815) and
              Co-operative bank (Certificate no.{' '}
              <a
                href="https://drive.google.com/file/d/1vy3Cr0R4Up3hXC5L1cezYA2PPc1f1LCg/view?usp=sharing"
                target="_blank"
                rel="noopener noreferrer"
              >
                CFI0024
              </a>
              ).
            </p>
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

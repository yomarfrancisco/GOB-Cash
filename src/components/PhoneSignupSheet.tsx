/**
 * PhoneSignupSheet - OTP verification after landing phone SMS send.
 * Matches AuthEntrySheet landing language, backdrop, and left-aligned layout.
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

const TERMS_URL = '/terms'

function formatPhoneHint(phone: string | null): string {
  if (!phone) return 'your phone'
  // Keep dial code + last 3 digits readable
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 4) return phone
  const last3 = digits.slice(-3)
  if (phone.startsWith('+258')) return `+258 ··· ··· ${last3}`
  if (phone.startsWith('+27')) return `+27 ··· ··· ${last3}`
  return `${phone.slice(0, 4)} ··· ${last3}`
}

export default function PhoneSignupSheet() {
  const {
    phoneSignupOpen,
    closePhoneSignup,
    closeAllAuth,
    dismissAuth,
    openAuthEntrySignup,
    phoneSignupPhone,
    phoneConfirmationResult,
    clearPhoneAuth,
  } = useAuthStore()
  const { pushNotification } = useNotificationStore()
  const { verifyCode } = useFirebasePhoneAuth()
  const [otpCode, setOtpCode] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const otpInputRef = useRef<HTMLInputElement>(null)

  const canSubmit =
    otpCode.trim().length === 6 && !isSubmitting && phoneConfirmationResult !== null

  useEffect(() => {
    if (phoneSignupOpen) {
      setOtpCode('')
      setIsSubmitting(false)
      setTimeout(() => otpInputRef.current?.focus(), 280)
    }
  }, [phoneSignupOpen])

  // Detect autofill — iOS sometimes fills without firing onChange
  useEffect(() => {
    if (!phoneSignupOpen || !otpInputRef.current) return

    const checkAutofill = () => {
      const input = otpInputRef.current
      if (input && input.value && !otpCode) {
        setOtpCode(input.value.replace(/\D/g, '').slice(0, 6))
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
    if (!canSubmit || !phoneConfirmationResult) return

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

  const handleCloseAll = () => {
    clearPhoneAuth()
    dismissAuth()
  }

  if (!phoneSignupOpen) return null

  const headlineId = 'phone-otp-headline'

  return (
    <ActionSheet
      open={phoneSignupOpen}
      onClose={handleCloseAll}
      title=""
      size="tall"
      className="handAuthSheet"
      ariaLabelledBy={headlineId}
    >
      <div className={styles.handAuthWrapper}>
        <div className={styles.handAuthRoot}>
          <Image
            src="/assets/sign up_first contact091120264.png"
            alt=""
            fill
            quality={92}
            sizes="100vw"
            style={{ objectFit: 'cover', objectPosition: 'center 15%' }}
          />
        </div>
        <button
          type="button"
          className={styles.passwordBackButton}
          onClick={handleBackToSignupOptions}
          aria-label="Back to phone number"
        >
          <Image
            src="/assets/back_ui.svg"
            alt=""
            width={24}
            height={24}
            sizes="24px"
            quality={92}
          />
        </button>
        <div className={clsx(styles.content, styles.authEntryContent)}>
          <div className={styles.landingSignIn}>
            <h1 id={headlineId} className={styles.landingHeadline}>
              Check your SMS.
              <br />
              Enter the code.
            </h1>
            <form className={styles.landingOtpField} onSubmit={handleSubmit}>
              <input
                ref={otpInputRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                name="otp"
                className={styles.landingOtpInput}
                value={otpCode}
                onChange={(e) => {
                  setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canSubmit) {
                    e.preventDefault()
                    void handleSubmit(e)
                  }
                }}
                placeholder="6-digit code"
                aria-label="SMS verification code"
              />
              {otpCode.length === 6 && (
                <button
                  type="submit"
                  className={styles.landingPhoneSubmit}
                  aria-label={isSubmitting ? 'Verifying' : 'Continue'}
                  disabled={!canSubmit}
                  aria-busy={isSubmitting}
                >
                  <ArrowUp className={styles.landingPhoneSubmitIcon} />
                </button>
              )}
            </form>
            <p className={styles.landingTerms}>
              Sent to {formatPhoneHint(phoneSignupPhone)}.{' '}
              <strong className={styles.landingTermsLead}>Dollars that find a way through</strong>
              . PAGA gets your payments through where banks and stablecoins stall, and delivers
              within 24 hours.{' '}
              <a href={TERMS_URL} className={styles.landingTermsLink}>
                Terms apply.
              </a>
            </p>
          </div>
        </div>
      </div>
    </ActionSheet>
  )
}

/**
 * PhoneSignupSheet - OTP verification after landing phone SMS send.
 * Matches AuthEntrySheet landing language, backdrop, and left-aligned layout.
 * Codes are verified via Twilio Verify → Firebase custom token.
 */

'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import clsx from 'clsx'
import { ArrowUp } from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { useNotificationStore } from '@/store/notifications'
import {
  mapTwilioCallableError,
  twilioVerifyOtpAndSignIn,
} from '@/lib/auth/twilioPhoneAuth'
import ActionSheet from './ActionSheet'
import styles from './AuthModal.module.css'

export default function PhoneSignupSheet() {
  const {
    phoneSignupOpen,
    closePhoneSignup,
    dismissAuth,
    openAuthEntrySignup,
    phoneSignupPhone,
    clearPhoneAuth,
  } = useAuthStore()
  const { pushNotification } = useNotificationStore()
  const [otpCode, setOtpCode] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const otpInputRef = useRef<HTMLInputElement>(null)

  const canSubmit =
    otpCode.trim().length === 6 && !isSubmitting && Boolean(phoneSignupPhone)

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
    if (!canSubmit || !phoneSignupPhone) return

    setIsSubmitting(true)

    try {
      await twilioVerifyOtpAndSignIn(phoneSignupPhone, otpCode.trim())
      clearPhoneAuth()
      setIsSubmitting(false)
    } catch (error: any) {
      setIsSubmitting(false)

      pushNotification({
        kind: 'payment_failed',
        title: 'Verification failed',
        body: mapTwilioCallableError(error),
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
          </div>
        </div>
      </div>
    </ActionSheet>
  )
}

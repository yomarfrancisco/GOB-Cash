/**
 * AuthEntrySheet - Sign-in method selection sheet
 * 
 * First screen in auth flow - shows Google option and username/phone input.
 * Uses same background image and styling as password auth sheet.
 */

'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import clsx from 'clsx'
import { ArrowUp } from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { useFirebaseAuth } from '@/hooks/useFirebaseAuth'
import { useFirebasePhoneAuth } from '@/hooks/useFirebasePhoneAuth'
import { useNotificationStore } from '@/store/notifications'
import { usePhoneSignals } from '@/hooks/usePhoneSignals'
import { resolveSadcPhone } from '@/lib/phone/resolveSadcPhone'
import ActionSheet from './ActionSheet'
import styles from './AuthModal.module.css'

type AuthMode = 'loginEntry' | 'signup'

export default function AuthEntrySheet() {
  const { 
    authEntryOpen, 
    closeAuthEntry,
    dismissAuth, 
    openAuthPassword, 
    openPhoneSignup, 
    setAuthIdentifier,
    setPhoneSignupPhone,
    setPhoneConfirmationResult,
    setPhoneResolutionMetadata
  } = useAuthStore()
  const { signInWithGoogle } = useFirebaseAuth()
  const { sendVerificationCode, normalizePhoneNumber } = useFirebasePhoneAuth()
  const { pushNotification } = useNotificationStore()
  const phoneSignals = usePhoneSignals()
  const [identifier, setIdentifier] = useState('')
  const [authMode, setAuthMode] = useState<AuthMode>('signup')
  const [isPhoneSignupEditing, setIsPhoneSignupEditing] = useState(false)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [isResolving, setIsResolving] = useState(false)
  const [resolveStatus, setResolveStatus] = useState<string | null>(null)
  const phoneInputRef = useRef<HTMLInputElement>(null)
  
  // Throttle: max 3 OTP attempts per 60 seconds
  const [otpAttempts, setOtpAttempts] = useState<number[]>([])

  // Reset mode when sheet opens - default to signup, unless explicitly set to login
  useEffect(() => {
    if (authEntryOpen) {
      const { authView } = useAuthStore.getState()
      // If authView is 'whatsapp-signin', start in login mode; otherwise default to signup
      setAuthMode(authView === 'whatsapp-signin' ? 'loginEntry' : 'signup')
      setIdentifier('')
      setIsPhoneSignupEditing(false)
      setPhoneNumber('')
      setIsResolving(false)
      setResolveStatus(null)
    }
  }, [authEntryOpen])

  const isDisabled = identifier.trim().length === 0

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isDisabled) return

    setAuthIdentifier(identifier.trim())
    closeAuthEntry()
    // Small delay to allow entry sheet to close before opening password sheet
    setTimeout(() => {
      openAuthPassword()
    }, 220)
  }

  const handleGoogleClick = () => {
    signInWithGoogle()
  }

  const handlePhoneSignUpClick = () => {
    openPhoneSignup()
  }

  const handlePhoneButtonClick = () => {
    setIsPhoneSignupEditing(true)
    // Focus the input after a brief delay to ensure it's rendered
    setTimeout(() => {
      phoneInputRef.current?.focus()
    }, 0)
  }

  const handlePhoneInputBlur = () => {
    // Only revert to button if input is empty
    if (phoneNumber.trim().length === 0) {
      setIsPhoneSignupEditing(false)
    }
  }

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (phoneNumber.trim().length === 0) return

    // Check throttle: max 3 attempts per 60 seconds
    const now = Date.now()
    const recentAttempts = otpAttempts.filter(timestamp => now - timestamp < 60000)
    if (recentAttempts.length >= 3) {
      pushNotification({
        kind: 'payment_failed',
        title: 'Too many attempts',
        body: 'Please try again in a minute',
        actor: { type: 'system' },
      })
      return
    }

    setIsResolving(true)
    setResolveStatus('Trying to verify your number…')

    try {
      // Resolve phone number with signals
      if (!phoneSignals) {
        // Fallback to old normalization if signals not ready
        const normalizedPhone = normalizePhoneNumber(phoneNumber.trim())
        setPhoneSignupPhone(normalizedPhone)
        const confirmationResult = await sendVerificationCode(normalizedPhone)
        setPhoneConfirmationResult(confirmationResult)
        setOtpAttempts([...recentAttempts, now])
        setIsResolving(false)
        setResolveStatus(null)
        closeAuthEntry()
        setTimeout(() => {
          openPhoneSignup()
        }, 220)
        return
      }

      const resolverResult = resolveSadcPhone({
        ...phoneSignals,
        rawInput: phoneNumber.trim(),
        digitsOnly: phoneNumber.trim().replace(/\D/g, ''),
      })

      if (process.env.NODE_ENV !== 'production') {
        console.log('[PHONE_RESOLVE]', {
          raw: phoneNumber.trim(),
          best: resolverResult.best ? `${resolverResult.best.iso2} ${resolverResult.best.countryCode}` : null,
          conf: resolverResult.confidence,
          reasons: resolverResult.best?.reasons || [],
          candidates: resolverResult.candidates.map(c => `${c.iso2}(${c.score.toFixed(2)})`),
        })
      }

      // Determine candidates to try
      const candidatesToTry: typeof resolverResult.candidates = []
      
      if (resolverResult.confidence >= 0.75 && resolverResult.best) {
        // High confidence - try best candidate first
        candidatesToTry.push(resolverResult.best)
      } else {
        // Low confidence or ambiguous - try top N (default 3)
        const topN = Math.min(3, resolverResult.candidates.length)
        candidatesToTry.push(...resolverResult.candidates.slice(0, topN))
      }

      if (candidatesToTry.length === 0) {
        throw new Error('No valid country candidates found')
      }

      // Try candidates sequentially
      let lastError: any = null
      let successCandidate: typeof resolverResult.candidates[0] | null = null

      for (const candidate of candidatesToTry) {
        try {
          // Store phone number
          setPhoneSignupPhone(candidate.e164)
          
          // Send SMS code
          const confirmationResult = await sendVerificationCode(candidate.e164)
          
          // Success! Store confirmation result and metadata
          setPhoneConfirmationResult(confirmationResult)
          successCandidate = candidate
          
          // Store resolution metadata in auth store for later persistence
          setPhoneResolutionMetadata({
            phoneRaw: phoneNumber.trim(),
            phoneE164: candidate.e164,
            phoneCountry: candidate.iso2,
            phoneCountryConfidence: resolverResult.confidence,
            phoneCountryCandidates: resolverResult.candidates.slice(0, 3).map(c => ({
              iso2: c.iso2,
              score: c.score,
              reasons: c.reasons.slice(0, 3), // Cap reason length
            })),
            signupTimezone: phoneSignals.timezone || null,
            signupLocale: phoneSignals.locale || null,
            geoAtSignup: phoneSignals.geo || null,
          })
          
          setOtpAttempts([...recentAttempts, now])
          setIsResolving(false)
          setResolveStatus(null)
          
          // Open OTP sheet
          closeAuthEntry()
          setTimeout(() => {
            openPhoneSignup()
          }, 220)
          return
        } catch (error: any) {
          lastError = error
          
          // If error clearly indicates invalid number, continue to next candidate
          if (
            error?.code === 'auth/invalid-phone-number' ||
            error?.message?.toLowerCase().includes('invalid') ||
            error?.message?.toLowerCase().includes('country')
          ) {
            // Try next candidate
            continue
          } else {
            // Other errors (quota, network, etc.) - don't retry
            throw error
          }
        }
      }

      // All candidates failed
      if (lastError) {
        throw new Error('We couldn\'t verify that number. Please include your country code (e.g. +27…)')
      }
    } catch (error: any) {
      setIsResolving(false)
      setResolveStatus(null)
      
      // Update throttle
      setOtpAttempts([...recentAttempts, now])
      
      pushNotification({
        kind: 'payment_failed',
        title: 'Failed to verify number',
        body: error.message || 'Please include your country code (e.g. +27…)',
        actor: { type: 'system' },
      })
    }
  }

  if (!authEntryOpen) return null

  const TERMS_URL = '/terms'
  const headlineId = 'auth-entry-headline'

  return (
    <ActionSheet
      open={authEntryOpen}
      onClose={dismissAuth}
      title=""
      size="tall"
      className="handAuthSheet"
      ariaLabelledBy={authMode === 'signup' ? headlineId : undefined}
    >
      <div className={styles.handAuthWrapper}>
        {/* Same sheet chrome as artwork version — white fill only, no image. */}
        <div className={styles.handAuthRoot} style={{ background: '#FFFFFF' }} />
        <div className={clsx(styles.content, styles.authEntryContent)}>
          {authMode === 'loginEntry' ? (
            <form className={clsx(styles.form, styles.authEntryForm)} onSubmit={handleSubmit}>
              <button
                type="button"
                className={styles.authEntrySocialButton}
                onClick={handleGoogleClick}
              >
                <Image
                  src="/assets/Group.svg"
                  alt=""
                  width={20}
                  height={20}
                  sizes="20px"
                  quality={92}
                  className={styles.authEntrySocialIcon}
                />
                <span className={styles.authEntrySocialText}>Sign in with Google</span>
              </button>

              <div className={styles.authEntryDivider}>
                <div className={styles.authEntryDividerLine} />
                <span className={styles.authEntryDividerText}>or</span>
                <div className={styles.authEntryDividerLine} />
              </div>

              <div className={styles.inputShellPill}>
                <input
                  type="text"
                  className={styles.inputPill}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isDisabled) {
                      e.preventDefault()
                      handleSubmit(e)
                    }
                  }}
                  placeholder="Username or phone number"
                />
                {identifier.trim().length > 0 && (
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

              <p className={styles.switchAuthText}>
                Don&apos;t have an account?{' '}
                <button
                  type="button"
                  className={styles.switchAuthLink}
                  onClick={() => setAuthMode('signup')}
                >
                  Sign up
                </button>
              </p>
            </form>
          ) : (
            <div className={styles.landingSignIn}>
              <h1 id={headlineId} className={styles.landingHeadline}>
                Meticais in.
                <br />
                Rand out.
              </h1>
              <button
                type="button"
                className={styles.landingGoogleButton}
                onClick={handleGoogleClick}
                aria-label="Continue with Google"
              >
                <Image
                  src="/assets/Group.svg"
                  alt=""
                  width={20}
                  height={20}
                  sizes="20px"
                  quality={92}
                  className={styles.landingGoogleIcon}
                />
                <span className={styles.landingGoogleLabel}>Continue with Google</span>
              </button>
              <p className={styles.landingTerms}>
                For licensed FX operators.{' '}
                <a href={TERMS_URL} className={styles.landingTermsLink}>
                  Terms apply.
                </a>
              </p>
            </div>
          )}
        </div>
      </div>
    </ActionSheet>
  )
}


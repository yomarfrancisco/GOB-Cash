/**
 * AuthEntrySheet - Sign-in method selection sheet
 * 
 * First screen in auth flow - shows Google option and username/phone input.
 * Uses same background image and styling as password auth sheet.
 */

'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import clsx from 'clsx'
import { ArrowUp } from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import ActionSheet from './ActionSheet'
import styles from './AuthModal.module.css'

type AuthMode = 'loginEntry' | 'signup'

export default function AuthEntrySheet() {
  const { authEntryOpen, closeAuthEntry, openAuthPassword, openPhoneSignup, setAuthIdentifier } = useAuthStore()
  const [identifier, setIdentifier] = useState('')
  const [authMode, setAuthMode] = useState<AuthMode>('signup')

  // Reset mode when sheet opens - default to signup, unless explicitly set to login
  useEffect(() => {
    if (authEntryOpen) {
      const { authView } = useAuthStore.getState()
      // If authView is 'whatsapp-signin', start in login mode; otherwise default to signup
      setAuthMode(authView === 'whatsapp-signin' ? 'loginEntry' : 'signup')
      setIdentifier('')
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
    console.log('Google auth coming soon')
  }

  const handlePhoneSignUpClick = () => {
    openPhoneSignup()
  }

  if (!authEntryOpen) return null

  return (
    <ActionSheet open={authEntryOpen} onClose={closeAuthEntry} title="" size="tall" className="handAuthSheet">
      <div className={styles.handAuthWrapper}>
        <div className={styles.handAuthRoot} />
        {/* Logo in top-left - conditionally render based on mode */}
        <div className={styles.authEntryHeader}>
          {authMode === 'signup' ? (
            <Image
              src="/assets/sign up black2.png"
              alt="Sign Up"
              className={styles.authEntryLogo}
              width={120}
              height={120}
              unoptimized
            />
          ) : (
            <Image
              src="/assets/bankless pink2.png"
              alt="GoBankless"
              className={styles.authEntryLogo}
              width={120}
              height={120}
              unoptimized
            />
          )}
        </div>
        <div className={clsx(styles.content, styles.authEntryContent)}>
          {authMode === 'loginEntry' ? (
            <form className={clsx(styles.form, styles.authEntryForm)} onSubmit={handleSubmit}>
              {/* Continue with Google button */}
              <button
                type="button"
                className={styles.authEntrySocialButton}
                onClick={handleGoogleClick}
              >
                <Image
                  src="/assets/Group.svg"
                  alt="Google"
                  width={20}
                  height={20}
                  unoptimized
                  className={styles.authEntrySocialIcon}
                />
                <span className={styles.authEntrySocialText}>Continue with Google</span>
              </button>

              {/* Divider with "or" */}
              <div className={styles.authEntryDivider}>
                <div className={styles.authEntryDividerLine} />
                <span className={styles.authEntryDividerText}>or</span>
                <div className={styles.authEntryDividerLine} />
              </div>

              {/* Username or phone input - pill shape with in-field submit button */}
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
                {/* Submit button - appears when there's text */}
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

              {/* Sign up link */}
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

              {/* Legal text */}
              <p className={styles.legal}>
                Gobankless is a service provider of the National Stokvel Association of
                South Africa, an authorised Financial Services Provider (FSP 52815) and
                Co-operative bank (Certificate no. CFI0024).
              </p>
            </form>
          ) : (
            <div className={clsx(styles.form, styles.authEntryForm)}>
              {/* Sign up with Google button */}
              <button
                type="button"
                className={styles.authEntrySocialButton}
                onClick={handleGoogleClick}
              >
                <Image
                  src="/assets/Group.svg"
                  alt="Google"
                  width={20}
                  height={20}
                  unoptimized
                  className={styles.authEntrySocialIcon}
                />
                <span className={styles.authEntrySocialText}>Sign up with Google</span>
              </button>

              {/* Sign up with phone number button */}
              <button
                type="button"
                className={styles.primaryPhoneButton}
                onClick={handlePhoneSignUpClick}
              >
                <Image
                  src="/assets/Phone-icon.svg"
                  alt="Phone"
                  width={23}
                  height={23}
                  unoptimized
                  className={styles.phoneIcon}
                />
                <span>Sign up with phone number</span>
              </button>

              {/* Log in link */}
              <p className={styles.switchAuthText}>
                Already have an account?{' '}
                <button
                  type="button"
                  className={styles.switchAuthLink}
                  onClick={() => setAuthMode('loginEntry')}
                >
                  Log in
                </button>
              </p>

              {/* Legal text */}
              <p className={styles.legal}>
                Gobankless is a service provider of the National Stokvel Association of
                South Africa, an authorised Financial Services Provider (FSP 52815) and
                Co-operative bank (Certificate no. CFI0024).
              </p>
            </div>
          )}
        </div>
      </div>
    </ActionSheet>
  )
}


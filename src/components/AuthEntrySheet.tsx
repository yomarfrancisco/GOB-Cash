/**
 * AuthEntrySheet - Sign-in method selection sheet
 * 
 * First screen in auth flow - shows Google/Instagram options and username/phone input.
 * Uses same background image and styling as password auth sheet.
 */

'use client'

import { useState } from 'react'
import Image from 'next/image'
import clsx from 'clsx'
import { useAuthStore } from '@/store/auth'
import ActionSheet from './ActionSheet'
import styles from './AuthModal.module.css'

export default function AuthEntrySheet() {
  const { authEntryOpen, closeAuthEntry, openAuthPassword, setAuthIdentifier } = useAuthStore()
  const [identifier, setIdentifier] = useState('')

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

  const handleInstagramClick = () => {
    console.log('Instagram auth coming soon')
  }

  const handleSignUpClick = () => {
    console.log('Sign up flow coming soon')
  }

  if (!authEntryOpen) return null

  return (
    <ActionSheet open={authEntryOpen} onClose={closeAuthEntry} title="" size="tall" className="handAuthSheet">
      <div className={styles.handAuthWrapper}>
        <div className={styles.handAuthRoot} />
        <div className={clsx(styles.content, styles.authEntryContent)}>
          <form className={clsx(styles.form, styles.authEntryForm)} onSubmit={handleSubmit}>
            {/* Logo in top-left */}
            <div className={styles.authEntryHeader}>
              <Image
                src="/assets/bankless pink.png"
                alt="GoBankless"
                className={styles.authEntryLogo}
                width={40}
                height={40}
                unoptimized
              />
            </div>

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

            {/* Continue with Instagram button */}
            <button
              type="button"
              className={styles.authEntrySocialButton}
              onClick={handleInstagramClick}
            >
              <Image
                src="/assets/IG_Icon.png"
                alt="Instagram"
                width={20}
                height={20}
                unoptimized
                className={styles.authEntrySocialIcon}
              />
              <span className={styles.authEntrySocialText}>Continue with Instagram</span>
            </button>

            {/* Divider with "or" */}
            <div className={styles.authEntryDivider}>
              <div className={styles.authEntryDividerLine} />
              <span className={styles.authEntryDividerText}>or</span>
              <div className={styles.authEntryDividerLine} />
            </div>

            {/* Username or phone input */}
            <label className={styles.field}>
              <span className={styles.authEntryFieldLabel}>Username or phone</span>
              <div className={styles.inputShell}>
                <input
                  type="text"
                  className={styles.input}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="Username or phone number"
                />
              </div>
            </label>

            {/* Continue button */}
            <button
              type="submit"
              className={clsx(styles.primaryButton, {
                [styles.primaryButtonDisabled]: isDisabled,
              })}
              disabled={isDisabled}
            >
              Continue
            </button>

            {/* Sign up link */}
            <p className={styles.authEntrySignUp}>
              Don&apos;t have an account?{' '}
              <button
                type="button"
                className={styles.authEntrySignUpLink}
                onClick={handleSignUpClick}
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
        </div>
      </div>
    </ActionSheet>
  )
}


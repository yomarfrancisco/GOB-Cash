/**
 * PhoneSignupSheet - Phone sign-up sheet with phone background image
 * 
 * Form sheet for phone sign-up flow. Uses sign_up - phone.png background.
 * Contains username, phone number, and password inputs with "Create a new account" button.
 */

'use client'

import { useState } from 'react'
import Image from 'next/image'
import clsx from 'clsx'
import { useAuthStore } from '@/store/auth'
import ActionSheet from './ActionSheet'
import styles from './AuthModal.module.css'

export default function PhoneSignupSheet() {
  const { phoneSignupOpen, closePhoneSignup, closeAuthEntry, openAuthEntry } = useAuthStore()
  const [username, setUsername] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isDisabled = !username.trim() || !phone.trim() || !password.trim() || isSubmitting

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isDisabled) return

    setIsSubmitting(true)
    // TODO: wire real sign-up later
    console.log('Sign up with phone:', { username, phone, password })
    setIsSubmitting(false)
  }

  const handleGoToLogin = () => {
    closePhoneSignup()
    // Small delay to allow phone sheet to close before opening login entry
    setTimeout(() => {
      openAuthEntry()
    }, 220)
  }

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
        {/* Centered GoBankless logo at top */}
        <div className={styles.phoneLogoWrapper}>
          <Image
            src="/assets/small—goBankless.png"
            alt="GoBankless"
            width={90}
            height={24}
            unoptimized
          />
        </div>
        <div className={styles.content}>
          <form className={clsx(styles.form, styles.phoneSignupForm)} onSubmit={handleSubmit}>
            {/* Username */}
            <div className={styles.inputShell}>
              <input
                className={styles.input}
                type="text"
                placeholder="$username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            {/* Phone number */}
            <div className={styles.inputShell}>
              <input
                className={styles.input}
                type="tel"
                placeholder="Phone number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            {/* Password */}
            <div className={styles.inputShell}>
              <input
                className={styles.input}
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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

            {/* Primary button */}
            <button
              type="submit"
              className={clsx(styles.primaryButton, {
                [styles.primaryButtonDisabled]: isDisabled,
              })}
              disabled={isDisabled}
            >
              Create a new account
            </button>

            {/* Bottom text */}
            <p className={styles.switchText}>
              Already have an account?{' '}
              <button
                type="button"
                className={styles.switchLink}
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


/**
 * AuthModal - Full-bleed hand artwork background with password gate
 * 
 * Shows the hand artwork as a full-bleed background with a password form overlay.
 * Visual gate only - password submission is a no-op for now.
 * All interactions trigger this single image sheet.
 */

'use client'

import { useState } from 'react'
import Image from 'next/image'
import clsx from 'clsx'
import { useAuthStore } from '@/store/auth'
import ActionSheet from './ActionSheet'
import styles from './AuthModal.module.css'

export default function AuthModal() {
  const { authOpen, closeAuth } = useAuthStore()
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const isDisabled = password.trim().length === 0

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isDisabled) return
    // TODO: later: integrate with real auth
    console.log('password submitted')
  }

  if (!authOpen) return null

  return (
    <ActionSheet open={authOpen} onClose={closeAuth} title="" size="tall" className="handAuthSheet">
      <div className={styles.handAuthWrapper}>
        <div className={styles.handAuthRoot} />
        <div className={styles.content}>
          <form className={styles.form} onSubmit={handleSubmit}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Password</span>
              <div className={styles.inputShell}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className={styles.input}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder=""
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

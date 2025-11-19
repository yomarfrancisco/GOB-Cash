'use client'

import { useState, FormEvent } from 'react'
import Image from 'next/image'
import { useAuthStore } from '@/store/auth'
import ActionSheet from './ActionSheet'
import ActionSheetItem from './ActionSheetItem'
import styles from './AuthModal.module.css'

export default function AuthModal() {
  const { authOpen, authView, closeAuth, completeAuth, setAuthView } = useAuthStore()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState<{ phone?: string; password?: string; confirmPassword?: string }>({})

  if (!authOpen) return null

  const handleGoogleAuth = () => {
    // UX-only: just set isAuthed and close
    completeAuth()
  }

  const handleWhatsAppClick = () => {
    setAuthView('whatsapp-signin')
    setErrors({})
    setPhone('')
    setPassword('')
    setConfirmPassword('')
  }

  const handleWhatsAppSubmit = (e: FormEvent) => {
    e.preventDefault()
    const newErrors: typeof errors = {}

    // Basic validation
    if (!phone.trim()) {
      newErrors.phone = 'Phone number is required'
    }

    if (!password.trim()) {
      newErrors.password = 'Password is required'
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters'
    }

    if (authView === 'whatsapp-signup') {
      if (!confirmPassword.trim()) {
        newErrors.confirmPassword = 'Please confirm your password'
      } else if (password !== confirmPassword) {
        newErrors.confirmPassword = 'Passwords do not match'
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    // Clear errors and complete auth
    setErrors({})
    completeAuth()
    // Reset form
    setPhone('')
    setPassword('')
    setConfirmPassword('')
  }

  const goBack = () => {
    setAuthView('provider-list')
    setErrors({})
    setPhone('')
    setPassword('')
    setConfirmPassword('')
  }

  const switchWhatsAppMode = (mode: 'whatsapp-signin' | 'whatsapp-signup') => {
    setAuthView(mode)
    setErrors({})
    setPassword('')
    setConfirmPassword('')
  }

  // Provider list view
  if (authView === 'provider-list') {
    return (
      <ActionSheet open={authOpen} onClose={closeAuth} title="Sign in to continue" size="compact">
        <p className={styles.subcopy}>
          Create a secure account so we can keep track of your cash-to-crypto transfers.
        </p>
        <div style={{ marginTop: '8px' }}>
          <ActionSheetItem
            icon={
              <Image
                src="/assets/Group.svg"
                alt="Google"
                width={24}
                height={24}
                style={{ objectFit: 'contain' }}
                unoptimized
              />
            }
            title="Continue with Google"
            caption="Sign in with your Google account"
            onClick={handleGoogleAuth}
          />
          <ActionSheetItem
            icon={
              <Image
                src="/assets/WhatsApp_Balck.png"
                alt="WhatsApp"
                width={24}
                height={24}
                style={{ objectFit: 'contain' }}
                unoptimized
              />
            }
            title="Continue with WhatsApp"
            caption="Use your WhatsApp number"
            onClick={handleWhatsAppClick}
          />
        </div>
      </ActionSheet>
    )
  }

  // WhatsApp sign-in view
  if (authView === 'whatsapp-signin') {
    return (
      <ActionSheet open={authOpen} onClose={closeAuth} title="Sign in with WhatsApp" size="tall">
        <p className={styles.subcopy}>
          Enter your WhatsApp number and password to continue.
        </p>
        <form onSubmit={handleWhatsAppSubmit} className={styles.form}>
          <div className={styles.inputGroup}>
            <input
              type="tel"
              placeholder="+27 82 123 4567"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value)
                if (errors.phone) setErrors({ ...errors, phone: undefined })
              }}
              className={styles.input}
              autoComplete="tel"
            />
            {errors.phone && <span className={styles.error}>{errors.phone}</span>}
          </div>

          <div className={styles.inputGroup}>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (errors.password) setErrors({ ...errors, password: undefined })
              }}
              className={styles.input}
              autoComplete="current-password"
            />
            {errors.password && <span className={styles.error}>{errors.password}</span>}
          </div>

          <button type="submit" className={styles.primaryButton}>
            Sign in
          </button>
        </form>

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => {
              // Placeholder for forgot password
              console.log('Forgot password clicked (not implemented yet)')
            }}
          >
            Forgot your password?
          </button>
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => switchWhatsAppMode('whatsapp-signup')}
          >
            New here? Create an account
          </button>
          <button type="button" className={styles.backButton} onClick={goBack}>
            ← Back
          </button>
        </div>
      </ActionSheet>
    )
  }

  // WhatsApp sign-up view
  return (
    <ActionSheet open={authOpen} onClose={closeAuth} title="Create an account with WhatsApp" size="tall">
      <form onSubmit={handleWhatsAppSubmit} className={styles.form}>
        <div className={styles.inputGroup}>
          <input
            type="tel"
            placeholder="+27 82 123 4567"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value)
              if (errors.phone) setErrors({ ...errors, phone: undefined })
            }}
            className={styles.input}
            autoComplete="tel"
          />
          {errors.phone && <span className={styles.error}>{errors.phone}</span>}
        </div>

        <div className={styles.inputGroup}>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              if (errors.password) setErrors({ ...errors, password: undefined })
            }}
            className={styles.input}
            autoComplete="new-password"
          />
          {errors.password && <span className={styles.error}>{errors.password}</span>}
        </div>

        <div className={styles.inputGroup}>
          <input
            type="password"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value)
              if (errors.confirmPassword) setErrors({ ...errors, confirmPassword: undefined })
            }}
            className={styles.input}
            autoComplete="new-password"
          />
          {errors.confirmPassword && <span className={styles.error}>{errors.confirmPassword}</span>}
        </div>

        <button type="submit" className={styles.primaryButton}>
          Create account
        </button>
      </form>

      <div className={styles.footer}>
        <button
          type="button"
          className={styles.linkButton}
          onClick={() => switchWhatsAppMode('whatsapp-signin')}
        >
          Already have an account? Sign in
        </button>
        <button type="button" className={styles.backButton} onClick={goBack}>
          ← Back
        </button>
      </div>
    </ActionSheet>
  )
}

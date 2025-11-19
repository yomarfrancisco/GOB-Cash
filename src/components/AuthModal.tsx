'use client'

import { useState, FormEvent } from 'react'
import Image from 'next/image'
import { useAuthStore } from '@/store/auth'
import styles from './AuthModal.module.css'

export default function AuthModal() {
  const { authOpen, authMode, closeAuth, completeAuth, setAuthMode } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string; confirmPassword?: string }>({})

  if (!authOpen) return null

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const newErrors: typeof errors = {}

    // Basic validation
    if (!email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Please enter a valid email'
    }

    if (!password.trim()) {
      newErrors.password = 'Password is required'
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters'
    }

    if (authMode === 'signup') {
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
    setEmail('')
    setPassword('')
    setConfirmPassword('')
  }

  const handleGoogleAuth = () => {
    // For now, treat Google auth the same as regular sign-in
    completeAuth()
    setEmail('')
    setPassword('')
    setConfirmPassword('')
  }

  const switchMode = (mode: 'signin' | 'signup') => {
    setAuthMode(mode)
    setErrors({})
    setEmail('')
    setPassword('')
    setConfirmPassword('')
  }

  return (
    <div className={styles.overlay} onClick={closeAuth}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeButton} onClick={closeAuth} aria-label="Close">
          <Image src="/assets/clear.svg" alt="" width={18} height={18} />
        </button>

        <div className={styles.content}>
          <h2 className={styles.title}>
            {authMode === 'signin' ? 'Sign in' : 'Create an account'}
          </h2>

          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.inputGroup}>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (errors.email) setErrors({ ...errors, email: undefined })
                }}
                className={styles.input}
                autoComplete="email"
              />
              {errors.email && <span className={styles.error}>{errors.email}</span>}
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
                autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'}
              />
              {errors.password && <span className={styles.error}>{errors.password}</span>}
            </div>

            {authMode === 'signup' && (
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
            )}

            <button type="submit" className={styles.primaryButton}>
              {authMode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <div className={styles.divider}>
            <span className={styles.dividerText}>or</span>
          </div>

          <button onClick={handleGoogleAuth} className={styles.googleButton}>
            <span className={styles.googleIcon}>G</span>
            <span>Continue with Google</span>
          </button>

          <div className={styles.footer}>
            {authMode === 'signin' ? (
              <>
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
                  onClick={() => switchMode('signup')}
                >
                  New here? Create an account
                </button>
              </>
            ) : (
              <button
                type="button"
                className={styles.linkButton}
                onClick={() => switchMode('signin')}
              >
                Already have an account? Sign in
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}


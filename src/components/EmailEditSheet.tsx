'use client'

import { useState, useEffect, useRef } from 'react'
import ActionSheet from './ActionSheet'
import { Check } from 'lucide-react'
import { useUserProfileStore } from '@/store/userProfile'
import { useEmailEditSheet } from '@/store/useEmailEditSheet'
import { useProfileEditSheet } from '@/store/useProfileEditSheet'
import styles from './EmailEditSheet.module.css'

export default function EmailEditSheet() {
  const { isOpen, close } = useEmailEditSheet()
  const { open: openProfileEdit } = useProfileEditSheet()
  const { profile, setProfile } = useUserProfileStore()
  const [email, setEmail] = useState(profile.email || '')
  const [emailError, setEmailError] = useState('')
  const emailRef = useRef<HTMLInputElement>(null)

  // Initialize from store when sheet opens
  useEffect(() => {
    if (!isOpen) return

    setEmail(profile.email || '')
    setEmailError('')
    // Focus email field after a brief delay
    setTimeout(() => {
      emailRef.current?.focus()
    }, 100)
  }, [isOpen, profile.email])

  // Reuse email validation from SocialLinksSheet
  const validateEmail = (value: string): boolean => {
    if (!value.trim()) return true // Email is optional
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(value)
  }

  const handleClose = () => {
    close()
    // Reopen Edit Profile sheet after a brief delay
    setTimeout(() => {
      openProfileEdit()
    }, 220)
  }

  const handleSave = () => {
    // Validate email if provided
    if (email.trim() && !validateEmail(email.trim())) {
      setEmailError('Please enter a valid email address')
      return
    }

    // Normalize email: trim and lowercase, convert empty string to undefined
    const trimmed = email.trim()
    const normalizedEmail = trimmed ? trimmed.toLowerCase() : undefined

    // Save to store
    setProfile({
      email: normalizedEmail,
    })

    // Close and reopen Edit Profile
    handleClose()
  }

  const handleRemove = () => {
    // Clear email from store
    setProfile({
      email: undefined,
    })

    // Close and reopen Edit Profile
    handleClose()
  }

  // Check if email is valid for button state
  const isValid = email.trim() === '' || validateEmail(email.trim())
  const canSave = isValid && !emailError

  return (
    <ActionSheet open={isOpen} onClose={handleClose} title="Enter your email address" size="tall">
      <div className={styles.emailEditContent}>
        {/* Email Input */}
        <label className={styles.emailRow}>
          <span className={styles.emailLabel}>Email</span>
          <input
            ref={emailRef}
            className={styles.emailInput}
            placeholder="you@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setEmailError('')
            }}
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="email"
            enterKeyHint="done"
            type="email"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canSave) {
                e.preventDefault()
                handleSave()
              }
            }}
          />
          <div className={styles.emailUnderline} />
          {emailError && (
            <div className={styles.emailError}>{emailError}</div>
          )}
        </label>

        {/* Done Button */}
        <div className={styles.doneButtonContainer}>
          <button
            className={`${styles.doneButton} ${canSave ? styles.doneButtonActive : styles.doneButtonInactive}`}
            disabled={!canSave}
            onClick={handleSave}
            type="button"
          >
            {canSave && <Check size={18} strokeWidth={2.5} />}
            Done
          </button>
        </div>

        {/* Remove Link Button */}
        {profile.email && (
          <div className={styles.removeButtonContainer}>
            <button
              onClick={handleRemove}
              type="button"
              className={styles.removeButton}
            >
              Remove link
            </button>
          </div>
        )}
      </div>
    </ActionSheet>
  )
}

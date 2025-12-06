'use client'

import { useState, useEffect, useRef } from 'react'
import BaseEditSheet from './helpers/BaseEditSheet'
import { useUserProfileStore } from '@/store/userProfile'
import { useEmailEditSheet } from '@/store/useEmailEditSheet'
import { useProfileEditSheet } from '@/store/useProfileEditSheet'

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
    
    // Focus email field to open keyboard immediately on mobile
    // Wait for sheet animation to start (sheet becomes visible), then focus
    // Using a small delay ensures the input is in the viewport and focusable
    const focusTimer = setTimeout(() => {
      if (emailRef.current) {
        emailRef.current.focus()
        // On iOS Safari, sometimes we need to trigger a click event to open keyboard
        // This is a known workaround for programmatic focus on mobile
        if (typeof window !== 'undefined' && 'ontouchstart' in window) {
          // Small delay after focus to ensure keyboard opens
          setTimeout(() => {
            emailRef.current?.click()
          }, 50)
        }
      }
    }, 150) // Small delay to let sheet animation start and input become visible
    
    return () => clearTimeout(focusTimer)
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
    // Use a shorter delay and check that EmailEditSheet is actually closed
    // This prevents multiple sheets in DOM while keeping transition smooth
    const checkAndOpen = () => {
      const { isOpen: emailEditOpen } = useEmailEditSheet.getState()
      if (!emailEditOpen) {
        openProfileEdit()
      } else {
        // If still open, check again after a short delay
        setTimeout(checkAndOpen, 50)
      }
    }
    setTimeout(checkAndOpen, 100)
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
  // Button is enabled (pink) only when email is non-empty AND valid
  const trimmedEmail = email.trim()
  const isValid = trimmedEmail === '' || validateEmail(trimmedEmail)
  const canSave = trimmedEmail !== '' && isValid && !emailError

  return (
    <BaseEditSheet
      open={isOpen}
      onClose={handleClose}
      title="Email address"
      primaryLabel="Done"
      secondaryLabel="Remove link"
      onPrimary={handleSave}
      onSecondary={handleRemove}
      isPrimaryDisabled={!canSave}
    >
      <label className="send-details-row">
        <span className="send-details-label">Enter your email address</span>
        <input
          ref={emailRef}
          className="send-details-input"
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
        <div className="send-details-underline" />
        {emailError && (
          <div style={{ marginTop: 4, fontSize: 14, color: '#ff3b30' }}>
            {emailError}
          </div>
        )}
      </label>
    </BaseEditSheet>
  )
}

'use client'

import { useState, useEffect, useRef } from 'react'
import ActionSheet from './ActionSheet'
import Image from 'next/image'
import { Check } from 'lucide-react'
import { useUserProfileStore } from '@/store/userProfile'
import { useEmailEditSheet } from '@/store/useEmailEditSheet'
import { useProfileEditSheet } from '@/store/useProfileEditSheet'
import '@/styles/send-details-sheet.css'

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
  // Button is enabled (pink) only when email is non-empty AND valid
  const trimmedEmail = email.trim()
  const isValid = trimmedEmail === '' || validateEmail(trimmedEmail)
  const canSave = trimmedEmail !== '' && isValid && !emailError

  return (
    <ActionSheet open={isOpen} onClose={handleClose} title="" className="send-details" size="tall">
      <div className="send-details-sheet">
        <div className="send-details-header">
          <button className="send-details-close" onClick={handleClose} aria-label="Close">
            <Image src="/assets/clear.svg" alt="" width={18} height={18} />
          </button>
          <h3 className="send-details-title">Enter your email address</h3>
          <div style={{ width: 32, flexShrink: 0 }} /> {/* Spacer for centering */}
        </div>
        <div className="send-details-fields">
          <label className="send-details-row">
            <span className="send-details-label">Email</span>
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

          {/* Done Button */}
          <div style={{ marginTop: 32, display: 'flex', justifyContent: 'center' }}>
            <button
              className="send-details-pay"
              disabled={!canSave}
              onClick={handleSave}
              type="button"
              style={{
                width: '100%',
                maxWidth: '382px',
                height: '56px',
                borderRadius: '56px',
                background: canSave ? '#FF2D55' : '#E9E9EB',
                color: canSave ? '#fff' : '#999',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '0 24px',
                fontSize: '16px',
                fontWeight: 500,
                letterSpacing: '-0.32px',
                cursor: canSave ? 'pointer' : 'not-allowed',
              }}
            >
              {canSave && <Check size={18} strokeWidth={2.5} />}
              Done
            </button>
          </div>

          {/* Remove Link Button - Always visible */}
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
            <button
              onClick={handleRemove}
              type="button"
              style={{
                background: 'transparent',
                border: 0,
                color: '#FF453A',
                fontSize: '16px',
                fontWeight: 400,
                cursor: 'pointer',
                padding: '8px 16px',
                textDecoration: 'none',
              }}
            >
              Remove link
            </button>
          </div>
        </div>
      </div>
    </ActionSheet>
  )
}

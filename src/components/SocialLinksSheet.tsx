'use client'

import { useState, useEffect, useRef } from 'react'
import ActionSheet from './ActionSheet'
import Image from 'next/image'
import { useUserProfileStore } from '@/store/userProfile'
import { useSocialLinksSheet } from '@/store/useSocialLinksSheet'
import '@/styles/send-details-sheet.css'

export default function SocialLinksSheet() {
  const { isOpen, close } = useSocialLinksSheet()
  const { profile, setProfile } = useUserProfileStore()
  const [email, setEmail] = useState(profile.email || '')
  const [instagramUrl, setInstagramUrl] = useState(profile.instagramUrl || '')
  const [linkedinUrl, setLinkedinUrl] = useState(profile.linkedinUrl || '')
  const [emailError, setEmailError] = useState('')
  const emailRef = useRef<HTMLInputElement>(null)
  const instagramRef = useRef<HTMLInputElement>(null)
  const linkedinRef = useRef<HTMLInputElement>(null)

  // Initialize from store when sheet opens
  useEffect(() => {
    if (!isOpen) return

    setEmail(profile.email || '')
    setInstagramUrl(profile.instagramUrl || '')
    setLinkedinUrl(profile.linkedinUrl || '')
    setEmailError('')
    // Focus first field after a brief delay
    setTimeout(() => {
      emailRef.current?.focus()
    }, 100)
  }, [isOpen, profile.email, profile.instagramUrl, profile.linkedinUrl])

  const validateEmail = (value: string): boolean => {
    if (!value.trim()) return true // Email is optional
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(value)
  }

  const handleSave = () => {
    // Validate email if provided
    if (email.trim() && !validateEmail(email.trim())) {
      setEmailError('Please enter a valid email address')
      return
    }

    // Save to store
    setProfile({
      email: email.trim() || undefined,
      instagramUrl: instagramUrl.trim() || undefined,
      linkedinUrl: linkedinUrl.trim() || undefined,
    })

    // Close sheet
    close()
  }

  const canSave = true // All fields are optional, so can always save

  return (
    <ActionSheet open={isOpen} onClose={close} title="" className="send-details">
      <div className="send-details-sheet">
        <div className="send-details-header">
          <button className="send-details-close" onClick={close} aria-label="Close">
            <Image src="/assets/clear.svg" alt="" width={18} height={18} />
          </button>
          <h3 className="send-details-title">Socials</h3>
          <button
            className="send-details-pay"
            disabled={!canSave}
            onClick={handleSave}
            type="button"
          >
            Save
          </button>
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
              enterKeyHint="next"
              type="email"
            />
            <div className="send-details-underline" />
            {emailError && (
              <div style={{ marginTop: 4, fontSize: 14, color: '#ff3b30' }}>
                {emailError}
              </div>
            )}
          </label>
          <label className="send-details-row">
            <span className="send-details-label">Instagram</span>
            <input
              ref={instagramRef}
              className="send-details-input"
              placeholder="https://instagram.com/yourname or @yourname"
              value={instagramUrl}
              onChange={(e) => setInstagramUrl(e.target.value)}
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              enterKeyHint="next"
              type="text"
            />
            <div className="send-details-underline" />
          </label>
          <label className="send-details-row">
            <span className="send-details-label">LinkedIn</span>
            <input
              ref={linkedinRef}
              className="send-details-input"
              placeholder="https://linkedin.com/in/yourname"
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              enterKeyHint="done"
              type="text"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleSave()
                }
              }}
            />
            <div className="send-details-underline" />
          </label>
        </div>
      </div>
    </ActionSheet>
  )
}


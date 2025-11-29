'use client'

import { useState, useEffect, useRef } from 'react'
import ActionSheet from './ActionSheet'
import { Check } from 'lucide-react'
import { useUserProfileStore } from '@/store/userProfile'
import { useLinkedInEditSheet } from '@/store/useLinkedInEditSheet'
import { useProfileEditSheet } from '@/store/useProfileEditSheet'
import '@/styles/send-details-sheet.css'

export default function LinkedInEditSheet() {
  const { isOpen, close } = useLinkedInEditSheet()
  const { open: openProfileEdit } = useProfileEditSheet()
  const { profile, setProfile } = useUserProfileStore()
  const [linkedinUrl, setLinkedinUrl] = useState(profile.linkedinUrl || '')
  const [linkedinError, setLinkedinError] = useState('')
  const linkedinRef = useRef<HTMLInputElement>(null)

  // Initialize from store when sheet opens
  useEffect(() => {
    if (!isOpen) return

    setLinkedinUrl(profile.linkedinUrl || '')
    setLinkedinError('')
    
    // Focus input field to open keyboard immediately on mobile
    const focusTimer = setTimeout(() => {
      if (linkedinRef.current) {
        linkedinRef.current.focus()
        if (typeof window !== 'undefined' && 'ontouchstart' in window) {
          setTimeout(() => {
            linkedinRef.current?.click()
          }, 50)
        }
      }
    }, 150)
    
    return () => clearTimeout(focusTimer)
  }, [isOpen, profile.linkedinUrl])

  // Simple validation: non-empty and contains linkedin.com
  const validateLinkedIn = (value: string): boolean => {
    if (!value.trim()) return true // Optional field
    return value.toLowerCase().includes('linkedin.com')
  }

  const handleClose = () => {
    close()
    const checkAndOpen = () => {
      const { isOpen: linkedinEditOpen } = useLinkedInEditSheet.getState()
      if (!linkedinEditOpen) {
        openProfileEdit()
      } else {
        setTimeout(checkAndOpen, 50)
      }
    }
    setTimeout(checkAndOpen, 100)
  }

  const handleSave = () => {
    // Validate if provided
    if (linkedinUrl.trim() && !validateLinkedIn(linkedinUrl.trim())) {
      setLinkedinError('Please enter a valid LinkedIn URL')
      return
    }

    // Normalize: trim value
    const trimmed = linkedinUrl.trim()
    const normalizedValue = trimmed || undefined

    // Save to store
    setProfile({
      linkedinUrl: normalizedValue,
    })

    // Close and reopen Edit Profile
    handleClose()
  }

  const handleRemove = () => {
    // Clear from store
    setProfile({
      linkedinUrl: undefined,
    })

    // Close and reopen Edit Profile
    handleClose()
  }

  // Button is enabled when value is non-empty and valid
  const trimmedValue = linkedinUrl.trim()
  const isValid = trimmedValue === '' || validateLinkedIn(trimmedValue)
  const canSave = trimmedValue !== '' && isValid && !linkedinError

  return (
    <ActionSheet open={isOpen} onClose={handleClose} title="" className="send-details" size="tall">
      <div className="send-details-sheet">
        <div className="send-details-header">
          {/* Header structure kept for layout, but close button removed - using ActionSheet's .as-close-only */}
        </div>
        <div className="send-details-fields">
          <label className="send-details-row">
            <span className="send-details-label">Enter your LinkedIn link</span>
            <input
              ref={linkedinRef}
              className="send-details-input"
              placeholder="https://www.linkedin.com/in/samakoyo"
              value={linkedinUrl}
              onChange={(e) => {
                setLinkedinUrl(e.target.value)
                setLinkedinError('')
              }}
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="url"
              enterKeyHint="done"
              type="url"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canSave) {
                  e.preventDefault()
                  handleSave()
                }
              }}
            />
            <div className="send-details-underline" />
            {linkedinError && (
              <div style={{ marginTop: 4, fontSize: 14, color: '#ff3b30' }}>
                {linkedinError}
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


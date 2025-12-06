'use client'

import { useState, useEffect, useRef } from 'react'
import BaseEditSheet from './helpers/BaseEditSheet'
import { useUserProfileStore } from '@/store/userProfile'
import { useLinkedInEditSheet } from '@/store/useLinkedInEditSheet'
import { useProfileEditSheet } from '@/store/useProfileEditSheet'

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
    <BaseEditSheet
      open={isOpen}
      onClose={handleClose}
      title="LinkedIn"
      primaryLabel="Done"
      secondaryLabel="Remove link"
      onPrimary={handleSave}
      onSecondary={handleRemove}
      isPrimaryDisabled={!canSave}
    >
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
    </BaseEditSheet>
  )
}

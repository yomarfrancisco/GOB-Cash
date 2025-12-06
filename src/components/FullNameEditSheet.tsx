'use client'

import { useState, useEffect, useRef } from 'react'
import BaseEditSheet from './helpers/BaseEditSheet'
import { useUserProfileStore } from '@/store/userProfile'
import { useFullNameEditSheet } from '@/store/useFullNameEditSheet'
import { useProfileEditSheet } from '@/store/useProfileEditSheet'

export default function FullNameEditSheet() {
  const { isOpen, close } = useFullNameEditSheet()
  const { open: openProfileEdit } = useProfileEditSheet()
  const { profile, setProfile } = useUserProfileStore()
  const [fullName, setFullName] = useState(profile.fullName || '')
  const [fullNameError, setFullNameError] = useState('')
  const fullNameRef = useRef<HTMLInputElement>(null)

  // Initialize from store when sheet opens
  useEffect(() => {
    if (!isOpen) return

    setFullName(profile.fullName || '')
    setFullNameError('')
    
    // Focus input field to open keyboard immediately on mobile
    const focusTimer = setTimeout(() => {
      if (fullNameRef.current) {
        fullNameRef.current.focus()
        if (typeof window !== 'undefined' && 'ontouchstart' in window) {
          setTimeout(() => {
            fullNameRef.current?.click()
          }, 50)
        }
      }
    }, 150)
    
    return () => clearTimeout(focusTimer)
  }, [isOpen, profile.fullName])

  const handleClose = () => {
    close()
    // Use state-based polling to prevent DOM overlap
    const checkAndOpen = () => {
      const { isOpen: fullNameEditOpen } = useFullNameEditSheet.getState()
      if (!fullNameEditOpen) {
        openProfileEdit()
      } else {
        setTimeout(checkAndOpen, 50)
      }
    }
    setTimeout(checkAndOpen, 100)
  }

  const handleSave = () => {
    // Normalize: trim value
    const trimmed = fullName.trim()
    const normalizedValue = trimmed || undefined

    // Save to store
    setProfile({
      fullName: normalizedValue,
    })

    // Close and reopen Edit Profile
    handleClose()
  }

  const handleClear = () => {
    // Clear full name from store
    setProfile({
      fullName: undefined,
    })

    // Close and reopen Edit Profile
    handleClose()
  }

  // Button is enabled when value is non-empty
  const trimmedValue = fullName.trim()
  const canSave = trimmedValue !== ''

  return (
    <BaseEditSheet
      open={isOpen}
      onClose={handleClose}
      title="Full name"
      primaryLabel="Done"
      secondaryLabel="Clear name"
      onPrimary={handleSave}
      onSecondary={handleClear}
      isPrimaryDisabled={!canSave}
    >
      <label className="send-details-row">
        <span className="send-details-label">Enter your full name</span>
        <input
          ref={fullNameRef}
          className="send-details-input"
          placeholder="Enter your first and last name"
          value={fullName}
          onChange={(e) => {
            setFullName(e.target.value)
            setFullNameError('')
          }}
          inputMode="text"
          autoCapitalize="words"
          autoCorrect="off"
          autoComplete="name"
          enterKeyHint="done"
          type="text"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canSave) {
              e.preventDefault()
              handleSave()
            }
          }}
        />
        <div className="send-details-underline" />
        {fullNameError && (
          <div style={{ marginTop: 4, fontSize: 14, color: '#ff3b30' }}>
            {fullNameError}
          </div>
        )}
      </label>
    </BaseEditSheet>
  )
}

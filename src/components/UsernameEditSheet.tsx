'use client'

import { useState, useEffect, useRef } from 'react'
import BaseEditSheet from './helpers/BaseEditSheet'
import { useUserProfileStore } from '@/store/userProfile'
import { useUsernameEditSheet } from '@/store/useUsernameEditSheet'
import { useProfileEditSheet } from '@/store/useProfileEditSheet'
import { normalizeHandle, validateHandle } from '@/lib/profile/handleValidation'

export default function UsernameEditSheet() {
  const { isOpen, close } = useUsernameEditSheet()
  const { open: openProfileEdit } = useProfileEditSheet()
  const { profile, setProfile } = useUserProfileStore()
  const [userHandle, setUserHandle] = useState(profile.userHandle || '')
  const [handleError, setHandleError] = useState('')
  const handleRef = useRef<HTMLInputElement>(null)

  // Initialize from store when sheet opens
  useEffect(() => {
    if (!isOpen) return

    setUserHandle(profile.userHandle || '')
    setHandleError('')
    
    // Focus input field to open keyboard immediately on mobile
    const focusTimer = setTimeout(() => {
      if (handleRef.current) {
        handleRef.current.focus()
        if (typeof window !== 'undefined' && 'ontouchstart' in window) {
          setTimeout(() => {
            handleRef.current?.click()
          }, 50)
        }
      }
    }, 150)
    
    return () => clearTimeout(focusTimer)
  }, [isOpen, profile.userHandle])

  const handleClose = () => {
    close()
    // Use state-based polling to prevent DOM overlap
    const checkAndOpen = () => {
      const { isOpen: usernameEditOpen } = useUsernameEditSheet.getState()
      if (!usernameEditOpen) {
        openProfileEdit()
      } else {
        setTimeout(checkAndOpen, 50)
      }
    }
    setTimeout(checkAndOpen, 100)
  }

  const handleSave = () => {
    // Normalize the handle
    const normalized = normalizeHandle(userHandle.trim())
    
    // Validate
    if (!validateHandle(normalized)) {
      setHandleError('Handle must start with @ and contain only letters, numbers, and underscores')
      return
    }

    // Save to store
    setProfile({
      userHandle: normalized,
    })

    // Close and reopen Edit Profile
    handleClose()
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    // Normalize on change to enforce @ prefix and character rules
    const normalized = normalizeHandle(value)
    setUserHandle(normalized)
    setHandleError('')
  }

  // Button is enabled when handle is valid
  const trimmedHandle = userHandle.trim()
  const normalized = normalizeHandle(trimmedHandle)
  const isValid = validateHandle(normalized)
  const canSave = isValid && !handleError

  return (
    <BaseEditSheet
      open={isOpen}
      onClose={handleClose}
      title="Username"
      primaryLabel="Done"
      onPrimary={handleSave}
      isPrimaryDisabled={!canSave}
    >
      <label className="send-details-row">
        <span className="send-details-label">Enter your username</span>
        <input
          ref={handleRef}
          className="send-details-input"
          placeholder="@preciouslee"
          value={userHandle}
          onChange={handleChange}
          inputMode="text"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="username"
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
        {handleError && (
          <div style={{ marginTop: 4, fontSize: 14, color: '#ff3b30' }}>
            {handleError}
          </div>
        )}
      </label>
    </BaseEditSheet>
  )
}

'use client'

import { useState, useEffect, useRef } from 'react'
import BaseEditSheet from './helpers/BaseEditSheet'
import { useUserProfileStore } from '@/store/userProfile'
import { useInstagramEditSheet } from '@/store/useInstagramEditSheet'
import { useProfileEditSheet } from '@/store/useProfileEditSheet'

export default function InstagramEditSheet() {
  const { isOpen, close } = useInstagramEditSheet()
  const { open: openProfileEdit } = useProfileEditSheet()
  const { profile, setProfile } = useUserProfileStore()
  const [instagramUrl, setInstagramUrl] = useState(profile.instagramUrl || '')
  const [instagramError, setInstagramError] = useState('')
  const instagramRef = useRef<HTMLInputElement>(null)

  // Initialize from store when sheet opens
  useEffect(() => {
    if (!isOpen) return

    setInstagramUrl(profile.instagramUrl || '')
    setInstagramError('')
    
    // Focus input field to open keyboard immediately on mobile
    const focusTimer = setTimeout(() => {
      if (instagramRef.current) {
        instagramRef.current.focus()
        if (typeof window !== 'undefined' && 'ontouchstart' in window) {
          setTimeout(() => {
            instagramRef.current?.click()
          }, 50)
        }
      }
    }, 150)
    
    return () => clearTimeout(focusTimer)
  }, [isOpen, profile.instagramUrl])

  // Simple close handler for X button - just closes this sheet
  const handleClose = () => {
    close()
  }

  // Close and reopen ProfileEditSheet (used by Done/Remove buttons)
  const handleCloseAndReopen = () => {
    close()
    const checkAndOpen = () => {
      const { isOpen: instagramEditOpen } = useInstagramEditSheet.getState()
      if (!instagramEditOpen) {
        openProfileEdit()
      } else {
        setTimeout(checkAndOpen, 50)
      }
    }
    setTimeout(checkAndOpen, 100)
  }

  const handleSave = () => {
    // Normalize: trim value
    const trimmed = instagramUrl.trim()
    const normalizedValue = trimmed || undefined

    // Save to store
    setProfile({
      instagramUrl: normalizedValue,
    })

    // Close and reopen Edit Profile
    handleCloseAndReopen()
  }

  const handleRemove = () => {
    // Clear from store
    setProfile({
      instagramUrl: undefined,
    })

    // Close and reopen Edit Profile
    handleCloseAndReopen()
  }

  // Button is enabled when value is non-empty
  const trimmedValue = instagramUrl.trim()
  const canSave = trimmedValue !== ''

  return (
    <BaseEditSheet
      open={isOpen}
      onClose={handleClose}
      title="Instagram"
      primaryLabel="Done"
      secondaryLabel="Remove link"
      onPrimary={handleSave}
      onSecondary={handleRemove}
      isPrimaryDisabled={!canSave}
    >
      <label className="send-details-row">
        <span className="send-details-label">Enter your Instagram handle</span>
        <input
          ref={instagramRef}
          className="send-details-input"
          placeholder="@preciouslee"
          value={instagramUrl}
          onChange={(e) => {
            setInstagramUrl(e.target.value)
            setInstagramError('')
          }}
          inputMode="text"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
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
        {instagramError && (
          <div style={{ marginTop: 4, fontSize: 14, color: '#ff3b30' }}>
            {instagramError}
          </div>
        )}
      </label>
    </BaseEditSheet>
  )
}

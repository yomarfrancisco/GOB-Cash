'use client'

import { useState, useEffect, useRef } from 'react'
import ActionSheet from './ActionSheet'
import { Check } from 'lucide-react'
import { useUserProfileStore } from '@/store/userProfile'
import { useFullNameEditSheet } from '@/store/useFullNameEditSheet'
import { useProfileEditSheet } from '@/store/useProfileEditSheet'
import '@/styles/send-details-sheet.css'

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
    <ActionSheet open={isOpen} onClose={handleClose} title="" className="send-details" size="tall">
      <div className="send-details-sheet">
        <div className="send-details-header">
          {/* Header structure kept for layout, but close button removed - using ActionSheet's .as-close-only */}
        </div>
        <div className="send-details-fields">
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

          {/* Clear Name Button - Always visible */}
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
            <button
              onClick={handleClear}
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
              Clear name
            </button>
          </div>
        </div>
      </div>
    </ActionSheet>
  )
}


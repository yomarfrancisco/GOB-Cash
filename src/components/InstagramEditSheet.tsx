'use client'

import { useState, useEffect, useRef } from 'react'
import ActionSheet from './ActionSheet'
import { Check } from 'lucide-react'
import { useUserProfileStore } from '@/store/userProfile'
import { useInstagramEditSheet } from '@/store/useInstagramEditSheet'
import { useProfileEditSheet } from '@/store/useProfileEditSheet'
import '@/styles/send-details-sheet.css'

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

  const handleClose = () => {
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
    handleClose()
  }

  const handleRemove = () => {
    // Clear from store
    setProfile({
      instagramUrl: undefined,
    })

    // Close and reopen Edit Profile
    handleClose()
  }

  // Button is enabled when value is non-empty
  const trimmedValue = instagramUrl.trim()
  const canSave = trimmedValue !== ''

  return (
    <ActionSheet open={isOpen} onClose={handleClose} title="" className="send-details" size="tall">
      <div className="send-details-sheet">
        <div className="send-details-header">
          {/* Header structure kept for layout, but close button removed - using ActionSheet's .as-close-only */}
        </div>
        <div className="send-details-fields">
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


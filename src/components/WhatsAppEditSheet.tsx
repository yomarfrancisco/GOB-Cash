'use client'

import { useState, useEffect, useRef } from 'react'
import ActionSheet from './ActionSheet'
import { Check } from 'lucide-react'
import { useUserProfileStore } from '@/store/userProfile'
import { useWhatsAppEditSheet } from '@/store/useWhatsAppEditSheet'
import { useProfileEditSheet } from '@/store/useProfileEditSheet'
import '@/styles/send-details-sheet.css'

export default function WhatsAppEditSheet() {
  const { isOpen, close } = useWhatsAppEditSheet()
  const { open: openProfileEdit } = useProfileEditSheet()
  const { profile, setProfile } = useUserProfileStore()
  const [whatsappUrl, setWhatsappUrl] = useState(profile.whatsappUrl || '')
  const [whatsappError, setWhatsappError] = useState('')
  const whatsappRef = useRef<HTMLInputElement>(null)

  // Initialize from store when sheet opens
  useEffect(() => {
    if (!isOpen) return

    setWhatsappUrl(profile.whatsappUrl || '')
    setWhatsappError('')
    
    // Focus input field to open keyboard immediately on mobile
    const focusTimer = setTimeout(() => {
      if (whatsappRef.current) {
        whatsappRef.current.focus()
        if (typeof window !== 'undefined' && 'ontouchstart' in window) {
          setTimeout(() => {
            whatsappRef.current?.click()
          }, 50)
        }
      }
    }, 150)
    
    return () => clearTimeout(focusTimer)
  }, [isOpen, profile.whatsappUrl])

  // Validation: strip formatting, check length >= 6
  const validateWhatsApp = (value: string): boolean => {
    if (!value.trim()) return true // Optional field
    // Strip spaces, parentheses, dashes - keep digits and +
    const cleaned = value.replace(/[\s()\-]/g, '')
    return cleaned.length >= 6
  }

  const handleClose = () => {
    close()
    const checkAndOpen = () => {
      const { isOpen: whatsappEditOpen } = useWhatsAppEditSheet.getState()
      if (!whatsappEditOpen) {
        openProfileEdit()
      } else {
        setTimeout(checkAndOpen, 50)
      }
    }
    setTimeout(checkAndOpen, 100)
  }

  const handleSave = () => {
    // Validate if provided
    if (whatsappUrl.trim() && !validateWhatsApp(whatsappUrl.trim())) {
      setWhatsappError('Please enter a valid phone number')
      return
    }

    // Normalize: trim value
    const trimmed = whatsappUrl.trim()
    const normalizedValue = trimmed || undefined

    // Save to store
    setProfile({
      whatsappUrl: normalizedValue,
    })

    // Close and reopen Edit Profile
    handleClose()
  }

  const handleRemove = () => {
    // Clear from store
    setProfile({
      whatsappUrl: undefined,
    })

    // Close and reopen Edit Profile
    handleClose()
  }

  // Button is enabled when value is non-empty and valid (length >= 6 after cleaning)
  const trimmedValue = whatsappUrl.trim()
  const isValid = trimmedValue === '' || validateWhatsApp(trimmedValue)
  const canSave = trimmedValue !== '' && isValid && !whatsappError

  return (
    <ActionSheet open={isOpen} onClose={handleClose} title="" className="send-details" size="tall">
      <div className="send-details-sheet">
        <div className="send-details-header">
          {/* Header structure kept for layout, but close button removed - using ActionSheet's .as-close-only */}
        </div>
        <div className="send-details-fields">
          <label className="send-details-row">
            <span className="send-details-label">Enter your WhatsApp number</span>
            <input
              ref={whatsappRef}
              className="send-details-input"
              placeholder="+27 82 123 4567"
              value={whatsappUrl}
              onChange={(e) => {
                setWhatsappUrl(e.target.value)
                setWhatsappError('')
              }}
              inputMode="tel"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="tel"
              enterKeyHint="done"
              type="tel"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canSave) {
                  e.preventDefault()
                  handleSave()
                }
              }}
            />
            <div className="send-details-underline" />
            {whatsappError && (
              <div style={{ marginTop: 4, fontSize: 14, color: '#ff3b30' }}>
                {whatsappError}
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


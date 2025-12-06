'use client'

import { useState, useEffect, useRef } from 'react'
import BaseEditSheet from './helpers/BaseEditSheet'
import { useUserProfileStore } from '@/store/userProfile'
import { useWhatsAppEditSheet } from '@/store/useWhatsAppEditSheet'
import { useProfileEditSheet } from '@/store/useProfileEditSheet'

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
    <BaseEditSheet
      open={isOpen}
      onClose={handleClose}
      title="WhatsApp number"
      primaryLabel="Done"
      secondaryLabel="Remove link"
      onPrimary={handleSave}
      onSecondary={handleRemove}
      isPrimaryDisabled={!canSave}
    >
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
    </BaseEditSheet>
  )
}

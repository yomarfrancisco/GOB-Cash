'use client'

import { useState, useEffect, useRef } from 'react'
import ActionSheet from './ActionSheet'
import Image from 'next/image'
import { useUserProfileStore } from '@/store/userProfile'
import { useNameHandleSheet } from '@/store/useNameHandleSheet'
import '@/styles/send-details-sheet.css'

export default function ProfileNameHandleSheet() {
  const { isOpen, close } = useNameHandleSheet()
  const { profile, setProfile } = useUserProfileStore()
  const [fullName, setFullName] = useState(profile.fullName)
  const [userHandle, setUserHandle] = useState(profile.userHandle)
  const [fullNameError, setFullNameError] = useState('')
  const [handleError, setHandleError] = useState('')
  const fullNameRef = useRef<HTMLInputElement>(null)
  const handleRef = useRef<HTMLInputElement>(null)

  // Initialize from store when sheet opens
  useEffect(() => {
    if (!isOpen) return

    setFullName(profile.fullName)
    setUserHandle(profile.userHandle)
    setFullNameError('')
    setHandleError('')
    // Focus first field after a brief delay
    setTimeout(() => {
      fullNameRef.current?.focus()
    }, 100)
  }, [isOpen, profile.fullName, profile.userHandle])

  const handleHandleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value

    // Always enforce a single @ prefix
    if (!value.startsWith('@')) {
      // Remove any existing @ symbols and add one at the start
      value = '@' + value.replace(/^@+/g, '')
    }
    // Ensure only one @ at the start, remove any @ symbols after the first character
    const afterAt = value.slice(1).replace(/@/g, '')
    // Remove spaces and replace with underscores
    const sanitized = afterAt.replace(/\s/g, '_')
    value = '@' + sanitized

    setUserHandle(value)
    setHandleError('')
  }

  const validate = (): boolean => {
    let isValid = true

    // Validate full name (optional but if provided, should be non-empty)
    if (fullName.trim().length === 0) {
      setFullNameError('Full name is required')
      isValid = false
    } else {
      setFullNameError('')
    }

    // Validate handle: must start with @ and have at least one character after
    if (!userHandle.startsWith('@') || userHandle.length <= 1) {
      setHandleError('Handle must start with @ and have at least one character')
      isValid = false
    } else {
      // Optional: validate handle format (alphanumeric + underscore only)
      const handlePart = userHandle.slice(1)
      if (!/^[a-zA-Z0-9_]+$/.test(handlePart)) {
        setHandleError('Handle can only contain letters, numbers, and underscores')
        isValid = false
      } else {
        setHandleError('')
      }
    }

    return isValid
  }

  const handleSave = () => {
    if (!validate()) {
      return
    }

    // Save to store
    setProfile({
      fullName: fullName.trim(),
      userHandle: userHandle.trim(),
    })

    // Close sheet
    close()
  }

  const canSave = fullName.trim().length > 0 && userHandle.trim().length > 1

  return (
    <ActionSheet open={isOpen} onClose={close} title="" className="send-details">
      <div className="send-details-sheet">
        <div className="send-details-header">
          <button className="send-details-close" onClick={close} aria-label="Close">
            <Image src="/assets/clear.svg" alt="" width={18} height={18} />
          </button>
          <h3 className="send-details-title">Name & Handle</h3>
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
            <span className="send-details-label">Full name</span>
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
              enterKeyHint="next"
              type="text"
            />
            <div className="send-details-underline" />
            {fullNameError && (
              <div style={{ marginTop: 4, fontSize: 14, color: '#ff3b30' }}>
                {fullNameError}
              </div>
            )}
          </label>
          <label className="send-details-row">
            <span className="send-details-label">User handle</span>
            <input
              ref={handleRef}
              className="send-details-input"
              placeholder="@yourhandle"
              value={userHandle}
              onChange={handleHandleChange}
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
            {handleError && (
              <div style={{ marginTop: 4, fontSize: 14, color: '#ff3b30' }}>
                {handleError}
              </div>
            )}
          </label>
        </div>
      </div>
    </ActionSheet>
  )
}


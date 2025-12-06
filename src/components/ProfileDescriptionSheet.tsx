'use client'

import { useState, useEffect, useRef } from 'react'
import BaseEditSheet from './helpers/BaseEditSheet'
import { useUserProfileStore } from '@/store/userProfile'
import { useProfileDescriptionSheet } from '@/store/useProfileDescriptionSheet'

export default function ProfileDescriptionSheet() {
  const { isOpen, close } = useProfileDescriptionSheet()
  const { profile, setProfile } = useUserProfileStore()
  const [description, setDescription] = useState(profile.description || '')
  const descriptionRef = useRef<HTMLTextAreaElement>(null)

  // Initialize from store when sheet opens
  useEffect(() => {
    if (!isOpen) return

    setDescription(profile.description || '')
    // Focus textarea after a brief delay
    setTimeout(() => {
      descriptionRef.current?.focus()
    }, 100)
  }, [isOpen, profile.description])

  const handleSave = () => {
    // Save to store
    setProfile({
      description: description.trim() || undefined,
    })

    // Close sheet
    close()
  }

  return (
    <BaseEditSheet
      open={isOpen}
      onClose={close}
      title="Profile Description"
      primaryLabel="Save"
      onPrimary={handleSave}
      isPrimaryDisabled={false}
    >
      <label className="send-details-row">
        <span className="send-details-label" style={{ marginBottom: 10 }}>
          Description
        </span>
        <textarea
          ref={descriptionRef}
          className="send-details-input"
          placeholder="Describe yourself to help others trust your profile."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          style={{
            minHeight: '80px',
            resize: 'vertical',
            fontFamily: 'inherit',
            lineHeight: '1.5',
          }}
        />
        <div className="send-details-underline" />
      </label>
    </BaseEditSheet>
  )
}


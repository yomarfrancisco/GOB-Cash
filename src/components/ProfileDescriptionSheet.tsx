'use client'

import { useState, useEffect, useRef } from 'react'
import ActionSheet from './ActionSheet'
import Image from 'next/image'
import { useUserProfileStore } from '@/store/userProfile'
import { useProfileDescriptionSheet } from '@/store/useProfileDescriptionSheet'
import '@/styles/send-details-sheet.css'

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

  const canSave = true // Description is optional, so can always save

  return (
    <ActionSheet open={isOpen} onClose={close} title="" className="send-details">
      <div className="send-details-sheet">
        <div className="send-details-header">
          <button className="send-details-close" onClick={close} aria-label="Close">
            <Image src="/assets/clear.svg" alt="" width={18} height={18} />
          </button>
          <h3 className="send-details-title">Profile Description</h3>
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
        </div>
      </div>
    </ActionSheet>
  )
}


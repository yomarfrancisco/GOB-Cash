'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import { Camera, Trash2 } from 'lucide-react'
import ActionSheet from './ActionSheet'
import { useAvatarEditSheet } from '@/store/useAvatarEditSheet'
import '@/styles/send-details-sheet.css'
import styles from './AvatarEditSheet.module.css'

// Temporary profile data - will use store when available
const defaultProfile = {
  fullName: 'Samuel Akoyo',
  email: 'samakoyo@example.com',
  handle: '$samakoyo',
  avatarUrl: null as string | null,
}

function getInitial(fullName?: string, email?: string, handle?: string): string {
  const initial = fullName?.[0] || email?.[0] || handle?.replace('$', '')[0] || '?'
  return initial.toUpperCase()
}

export default function AvatarEditSheet() {
  const { isOpen, close } = useAvatarEditSheet()
  const profile = defaultProfile
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(profile.avatarUrl ?? null)

  const handlePick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Create preview URL
    const url = URL.createObjectURL(file)
    setPreview(url)

    // TODO: uploadAvatar(file)
    console.log('Upload avatar:', file.name)
  }

  const handleDelete = () => {
    if (!window.confirm('Remove your profile picture?')) return

    setPreview(null)

    // TODO: removeAvatar()
    console.log('Remove avatar')
  }

  const handleDone = () => {
    close()
  }

  const showDefault = !preview
  const initial = getInitial(profile.fullName, profile.email, profile.handle)

  return (
    <ActionSheet open={isOpen} onClose={close} title="" className="send-details">
      <div className="send-details-sheet">
        <div className="send-details-header">
          <button className="send-details-close" onClick={close} aria-label="Close">
            <Image src="/assets/clear.svg" alt="" width={18} height={18} />
          </button>
          <div style={{ flex: 1 }} /> {/* Spacer */}
          <button
            className={styles.doneBtn}
            onClick={handleDone}
            type="button"
          >
            Done
          </button>
        </div>
        <div className={styles.body}>
          <div className={styles.avatarContainer}>
            <div className={styles.avatarWrapper}>
              {showDefault ? (
                <>
                  <Image
                    src="/assets/avatar-profile.png"
                    alt="Default avatar"
                    fill
                    className={styles.avatarImg}
                  />
                  <span className={styles.initial}>{initial}</span>
                </>
              ) : (
                <Image
                  src={preview}
                  alt="Avatar preview"
                  fill
                  className={styles.avatarImg}
                />
              )}

              {/* Delete chip (top-right) */}
              <button
                className={styles.deleteChip}
                onClick={handleDelete}
                aria-label="Remove avatar"
                type="button"
              >
                <Trash2 size={16} />
              </button>

              {/* Camera chip (bottom-right) */}
              <button
                className={styles.cameraChip}
                onClick={handlePick}
                aria-label="Change avatar"
                type="button"
              >
                <Camera size={18} />
              </button>
            </div>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="user"
              className={styles.fileInput}
              onChange={handleFileChange}
            />
          </div>

          {/* Read-only Name and Handle */}
          <div className={styles.meta}>
            <div className={styles.metaRow}>
              <div className={styles.metaLabel}>Name</div>
              <div className={styles.metaValue}>{profile.fullName}</div>
            </div>
            <div className={styles.metaRow}>
              <div className={styles.metaLabel}>Handle</div>
              <div className={styles.metaValue}>{profile.handle}</div>
            </div>
          </div>
        </div>
      </div>
    </ActionSheet>
  )
}


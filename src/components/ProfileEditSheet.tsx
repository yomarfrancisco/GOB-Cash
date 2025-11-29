'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { Camera, Instagram, Linkedin, Check } from 'lucide-react'
import ActionSheet from './ActionSheet'
import { useProfileEditSheet } from '@/store/useProfileEditSheet'
import { useNameHandleSheet } from '@/store/useNameHandleSheet'
import { useSocialLinksSheet } from '@/store/useSocialLinksSheet'
import { useUserProfileStore } from '@/store/userProfile'
import { uploadAvatar, removeAvatar } from '@/lib/profile'
import { resizeImage } from '@/lib/imageResize'
import { useNotificationStore } from '@/store/notifications'
import Avatar from './Avatar'
import styles from './ProfileEditSheet.module.css'
import '@/styles/profile-toggle.css'

export default function ProfileEditSheet() {
  const { isOpen, close } = useProfileEditSheet()
  const { open: openNameHandle } = useNameHandleSheet()
  const { open: openSocialLinks } = useSocialLinksSheet()
  const { profile, setProfile } = useUserProfileStore()
  const pushNotification = useNotificationStore((state) => state.pushNotification)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile.avatarUrl)
  const [isUploading, setIsUploading] = useState(false)
  const [editMode, setEditMode] = useState<'edit' | 'preview'>('edit')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const backdropInputRef = useRef<HTMLInputElement>(null)

  // Sync avatarUrl from store when profile changes
  useEffect(() => {
    setAvatarUrl(profile.avatarUrl)
  }, [profile.avatarUrl])

  // Derive hasCustomAvatar from avatarUrl
  const hasCustomAvatar = avatarUrl !== null

  const clearAvatar = async () => {
    setIsUploading(true)
    const previousAvatarUrl = avatarUrl

    try {
      await removeAvatar()
      setAvatarUrl(null)
      setProfile({ avatarUrl: null })
    } catch (err) {
      console.error('Failed to remove avatar:', err)
      // Revert on error
      setAvatarUrl(previousAvatarUrl)
      pushNotification({
        kind: 'payment_failed',
        title: 'Remove failed',
        body: 'Could not remove photo. Please try again.',
        actor: { type: 'user' },
      })
    } finally {
      setIsUploading(false)
    }
  }

  const handleAvatarClick = () => {
    if (typeof window === 'undefined') return

    if (!hasCustomAvatar) {
      // No custom avatar → open native file picker
      fileInputRef.current?.click()
    } else {
      // Custom avatar exists → clear it
      clearAvatar()
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      pushNotification({
        kind: 'payment_failed',
        title: 'Image too large',
        body: 'Maximum file size is 5MB. Please choose a smaller image.',
        actor: { type: 'user' },
      })
      e.target.value = ''
      return
    }

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
    if (!validTypes.includes(file.type)) {
      pushNotification({
        kind: 'payment_failed',
        title: 'Invalid file type',
        body: 'Please use JPEG, PNG, WebP, or HEIC format.',
        actor: { type: 'user' },
      })
      e.target.value = ''
      return
    }

    setIsUploading(true)
    const previousAvatarUrl = avatarUrl

    try {
      // Optimistic UI: show preview immediately
      const previewUrl = URL.createObjectURL(file)
      setAvatarUrl(previewUrl)

      // Resize if needed (optional: only if > 1024px)
      let fileToUpload = file
      try {
        if (typeof window === 'undefined') {
          // SSR guard - skip resize check on server
          fileToUpload = file
        } else {
          // Check if image needs resizing using createImageBitmap (faster) or HTMLImageElement (fallback)
          let needsResize = false

          if ('createImageBitmap' in window) {
            try {
              const bmp = await createImageBitmap(file)
              needsResize = bmp.width > 1024 || bmp.height > 1024
              bmp.close()
            } catch {
              // Fallback to HTMLImageElement if createImageBitmap fails
              const objectUrl = URL.createObjectURL(file)
              
              // Use a DOM-typed constructor that TS accepts
              const ImageCtor: new () => HTMLImageElement =
                (typeof globalThis !== 'undefined' && (globalThis as any).Image)
                  ? (globalThis as any).Image
                  : (class {} as unknown as new () => HTMLImageElement)
              
              const htmlImg = new ImageCtor()
              needsResize = await new Promise<boolean>((resolve) => {
                htmlImg.onload = () => {
                  resolve(htmlImg.width > 1024 || htmlImg.height > 1024)
                }
                htmlImg.onerror = () => resolve(false)
                htmlImg.src = objectUrl
              })
              URL.revokeObjectURL(objectUrl)
            }
          } else {
            // Fallback to HTMLImageElement
            const objectUrl = URL.createObjectURL(file)
            
            // Use a DOM-typed constructor that TS accepts
            const ImageCtor: new () => HTMLImageElement =
              (typeof globalThis !== 'undefined' && (globalThis as any).Image)
                ? (globalThis as any).Image
                : (class {} as unknown as new () => HTMLImageElement)
            
            const htmlImg = new ImageCtor()
            needsResize = await new Promise<boolean>((resolve) => {
              htmlImg.onload = () => {
                resolve(htmlImg.width > 1024 || htmlImg.height > 1024)
              }
              htmlImg.onerror = () => resolve(false)
              htmlImg.src = objectUrl
            })
            URL.revokeObjectURL(objectUrl)
          }

          if (needsResize) {
            fileToUpload = await resizeImage(file, { maxEdge: 1024 })
          }
        }
      } catch (resizeErr) {
        console.warn('Resize failed, using original:', resizeErr)
        // Continue with original file if resize fails
      }

      // Upload avatar
      const url = await uploadAvatar(fileToUpload)
      
      // Revoke preview URL and set final URL
      URL.revokeObjectURL(previewUrl)
      setAvatarUrl(url)

      // Update profile store
      setProfile({ avatarUrl: url })

      // No success notification - avatar updates immediately (optimistic UI)
    } catch (err) {
      console.error('Failed to upload avatar:', err)
      // Revert to previous avatar on error
      setAvatarUrl(previousAvatarUrl)
      pushNotification({
        kind: 'payment_failed',
        title: 'Upload failed',
        body: 'Could not update photo. Please try again.',
        actor: { type: 'user' },
      })
    } finally {
      setIsUploading(false)
      e.target.value = ''
    }
  }

  const handleNameHandle = () => {
    close()
    openNameHandle()
  }

  const handleSocialLinks = () => {
    close()
    openSocialLinks()
  }

  const handleBackdropClick = () => {
    // TODO: Implement backdrop change flow
    console.log('Change backdrop TBD')
    // For now, can reuse avatar upload logic or create separate handler
    // backdropInputRef.current?.click()
  }

  function getInitial(fullName?: string, email?: string, handle?: string): string {
    const initial = fullName?.[0] || email?.[0] || handle?.replace(/^[@$]/, '')[0] || '?'
    return initial.toUpperCase()
  }

  return (
    <>
      <ActionSheet open={isOpen} onClose={close} title="Edit profile" size="tall">
        <div className={styles.editSheetContent}>
          {/* Segmented Control: Edit / Preview */}
          <div className={styles.segmentedControl}>
            <div
              role="tablist"
              className="autonomy-toggle"
              style={{ width: '100%', maxWidth: '280px', margin: '0 auto' }}
            >
              <button
                role="tab"
                aria-selected={editMode === 'edit'}
                className={`seg ${editMode === 'edit' ? 'seg--active' : ''}`}
                onClick={() => setEditMode('edit')}
              >
                Edit
              </button>
              <button
                role="tab"
                aria-selected={editMode === 'preview'}
                className={`seg ${editMode === 'preview' ? 'seg--active' : ''}`}
                onClick={() => setEditMode('preview')}
              >
                Preview
              </button>
            </div>
          </div>

          {/* Main Profile Card */}
          <div className={styles.profileCard}>
            {/* Avatar */}
            <div className={styles.avatarContainer}>
              <div className={styles.avatarWrapper}>
                <Avatar
                  name={profile.fullName}
                  email={profile.email}
                  avatarUrl={avatarUrl}
                  size={112}
                  rounded={32}
                />
                {isUploading && (
                  <div className={styles.uploadingOverlay}>
                    <div className={styles.spinner} />
                  </div>
                )}
                <button
                  className={styles.avatarEditButton}
                  onClick={handleAvatarClick}
                  aria-label={hasCustomAvatar ? 'Remove profile photo' : 'Change profile photo'}
                  type="button"
                >
                  <Camera size={20} strokeWidth={2} style={{ color: '#fff' }} />
                </button>
              </div>
            </div>

            {/* Username Row */}
            <button
              className={styles.profileRow}
              onClick={handleNameHandle}
              type="button"
            >
              <div className={styles.profileRowLeft}>
                <span className={styles.profileRowLabel}>Username</span>
                <span className={styles.profileRowValue}>{profile.userHandle || '@handle'}</span>
              </div>
              <Image src="/assets/next_ui.svg" alt="" width={18} height={18} style={{ opacity: 0.4 }} />
            </button>

            {/* Full Name Row */}
            <button
              className={styles.profileRow}
              onClick={handleNameHandle}
              type="button"
            >
              <div className={styles.profileRowLeft}>
                <span className={styles.profileRowLabel}>Full name (optional)</span>
                <span className={styles.profileRowValue}>
                  {profile.fullName || (
                    <span style={{ opacity: 0.3 }}>Enter your first and last name</span>
                  )}
                </span>
              </div>
              <Image src="/assets/next_ui.svg" alt="" width={18} height={18} style={{ opacity: 0.4 }} />
            </button>
          </div>

          {/* Public Links Card */}
          <div className={styles.sectionContainer}>
            <h2 className={styles.sectionHeading}>Public links</h2>
            <div className={styles.linksCard}>
              <button
                className={styles.linkRow}
                onClick={handleSocialLinks}
                type="button"
              >
                <div className={styles.linkRowLeft}>
                  <div className={styles.linkIcon}>
                    <Instagram size={22} strokeWidth={2} style={{ color: '#111' }} />
                  </div>
                  <span className={styles.linkRowLabel}>Instagram</span>
                </div>
                <Image src="/assets/next_ui.svg" alt="" width={18} height={18} style={{ opacity: 0.4 }} />
              </button>
              <button
                className={styles.linkRow}
                onClick={handleSocialLinks}
                type="button"
              >
                <div className={styles.linkRowLeft}>
                  <div className={styles.linkIcon}>
                    <Linkedin size={22} strokeWidth={2} style={{ color: '#111' }} />
                  </div>
                  <span className={styles.linkRowLabel}>LinkedIn</span>
                </div>
                <Image src="/assets/next_ui.svg" alt="" width={18} height={18} style={{ opacity: 0.4 }} />
              </button>
              <button
                className={styles.linkRow}
                onClick={handleSocialLinks}
                type="button"
              >
                <div className={styles.linkRowLeft}>
                  <div className={styles.linkIcon}>
                    <Image src="/assets/profile/tik_tok.svg" alt="TikTok" width={22} height={22} />
                  </div>
                  <span className={styles.linkRowLabel}>TikTok</span>
                </div>
                <Image src="/assets/next_ui.svg" alt="" width={18} height={18} style={{ opacity: 0.4 }} />
              </button>
              <button
                className={styles.linkRow}
                onClick={handleSocialLinks}
                type="button"
              >
                <div className={styles.linkRowLeft}>
                  <div className={styles.linkIcon}>
                    <span style={{ fontSize: 22, fontWeight: 600, color: '#111' }}>𝕏</span>
                  </div>
                  <span className={styles.linkRowLabel}>X</span>
                </div>
                <Image src="/assets/next_ui.svg" alt="" width={18} height={18} style={{ opacity: 0.4 }} />
              </button>
            </div>
          </div>

          {/* Backdrop Card */}
          <div className={styles.sectionContainer}>
            <h2 className={styles.sectionHeading}>Backdrop</h2>
            <div className={styles.backdropCard}>
              <div className={styles.backdropImageContainer}>
                <Image
                  src="/assets/benjamin_grey.png"
                  alt="Backdrop"
                  fill
                  style={{ objectFit: 'cover', borderRadius: '24px' }}
                />
                <button
                  className={styles.backdropEditButton}
                  onClick={handleBackdropClick}
                  aria-label="Change backdrop"
                  type="button"
                >
                  <Camera size={20} strokeWidth={2} style={{ color: '#fff' }} />
                </button>
              </div>
            </div>
          </div>

          {/* Done Button */}
          <div className={styles.doneButtonContainer}>
            <button
              className={styles.doneButton}
              onClick={close}
              type="button"
            >
              <Check size={18} strokeWidth={2.5} style={{ marginRight: 8 }} />
              Done
            </button>
          </div>
        </div>
      </ActionSheet>

      {/* Hidden file input for avatar */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className={styles.fileInput}
        onChange={handleFileChange}
      />

      {/* Hidden file input for backdrop (future use) */}
      <input
        ref={backdropInputRef}
        type="file"
        accept="image/*"
        className={styles.fileInput}
        onChange={() => {
          // TODO: Implement backdrop upload
        }}
      />
    </>
  )
}

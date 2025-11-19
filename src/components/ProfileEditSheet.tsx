'use client'

import { useState, useRef, useEffect } from 'react'
import NextImage from 'next/image'
import { UserCircle2, Share2, UserPen, Trash2 } from 'lucide-react'
import ActionSheet from './ActionSheet'
import ActionSheetItem from './ActionSheetItem'
import { useProfileEditSheet } from '@/store/useProfileEditSheet'
import { useNameHandleSheet } from '@/store/useNameHandleSheet'
import { useSocialLinksSheet } from '@/store/useSocialLinksSheet'
import { useProfileDescriptionSheet } from '@/store/useProfileDescriptionSheet'
import { useUserProfileStore } from '@/store/userProfile'
import { uploadAvatar, removeAvatar } from '@/lib/profile'
import { resizeImage } from '@/lib/imageResize'
import { useNotificationStore } from '@/store/notifications'
import styles from './ProfileEditSheet.module.css'

export default function ProfileEditSheet() {
  const { isOpen, close } = useProfileEditSheet()
  const { open: openNameHandle } = useNameHandleSheet()
  const { open: openSocialLinks } = useSocialLinksSheet()
  const { open: openProfileDescription } = useProfileDescriptionSheet()
  const { profile, setProfile } = useUserProfileStore()
  const pushNotification = useNotificationStore((state) => state.pushNotification)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile.avatarUrl)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const handleAvatarRowPress = () => {
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

  const handleProfileDescription = () => {
    close()
    openProfileDescription()
  }

  // Avatar icon component for Profile Picture tile
  const AvatarIcon = () => {
    const showDefault = !avatarUrl
    const initial = getInitial(profile.fullName, profile.email, profile.userHandle)

    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          overflow: 'hidden',
          position: 'relative',
          background: '#1a1a1a',
        }}
      >
        {showDefault ? (
          <>
            <NextImage
              src="/assets/avatar-profile.png"
              alt="Profile avatar"
              fill
              style={{ objectFit: 'cover' }}
            />
            <span
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
                fontWeight: 300,
                color: '#f5f5f5',
                textShadow: '0 1px 2px rgba(0,0,0,0.35)',
                pointerEvents: 'none',
                zIndex: 1,
              }}
            >
              {initial}
            </span>
          </>
        ) : (
          <NextImage
            src={avatarUrl}
            alt="Profile avatar"
            fill
            style={{ objectFit: 'cover', borderRadius: '50%' }}
          />
        )}
        {isUploading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0, 0, 0, 0.5)',
              borderRadius: '50%',
              zIndex: 2,
            }}
          >
            <div
              style={{
                width: 20,
                height: 20,
                border: '2px solid rgba(255, 255, 255, 0.3)',
                borderTopColor: '#fff',
                borderRadius: '50%',
                animation: 'spin 0.6s linear infinite',
              }}
            />
          </div>
        )}
      </div>
    )
  }

  function getInitial(fullName?: string, email?: string, handle?: string): string {
    const initial = fullName?.[0] || email?.[0] || handle?.replace(/^[@$]/, '')[0] || '?'
    return initial.toUpperCase()
  }

  return (
    <>
      <ActionSheet open={isOpen} onClose={close} title="Edit Profile">
        <ActionSheetItem
          icon={<AvatarIcon />}
          title="Profile picture"
          caption="Update your photo"
          onClick={handleAvatarRowPress}
          trailing={
            <div className={styles.addIconButton} aria-label={hasCustomAvatar ? 'Remove profile photo' : 'Change profile photo'}>
              {hasCustomAvatar ? (
                <Trash2 size={24} className={styles.addIconSvg} style={{ color: '#121212' }} />
              ) : (
                <NextImage
                  src="/assets/profile/add_circle_outlined.svg"
                  alt="Add photo"
                  width={24}
                  height={24}
                  className={styles.addIconSvg}
                />
              )}
            </div>
          }
        />
        <ActionSheetItem
          icon={<UserCircle2 size={22} strokeWidth={2} style={{ color: '#111' }} />}
          title="Name & Handle"
          caption="Edit your display name and unique handle"
          onClick={handleNameHandle}
        />
        <ActionSheetItem
          icon={<Share2 size={22} strokeWidth={2} style={{ color: '#111' }} />}
          title="Social Links"
          caption="Add or update your email, Instagram or LinkedIn links"
          onClick={handleSocialLinks}
        />
        <ActionSheetItem
          icon={<UserPen size={22} strokeWidth={2} style={{ color: '#111' }} />}
          title="Profile Description"
          caption="Add a short bio to help others know who they're transacting with."
          onClick={handleProfileDescription}
        />
      </ActionSheet>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className={styles.fileInput}
        onChange={handleFileChange}
      />
    </>
  )
}

'use client'

import Image from 'next/image'
import { memo, useMemo } from 'react'
import { getAvatarColorForHandle, getContactInitial } from '@/lib/contactAvatarColors'
import styles from './DirectoryAvatar.module.css'

type DirectoryAvatarProps = {
  photoUrl?: string | null
  handle?: string
  name?: string
  size?: number
  className?: string
}

/**
 * Avatar component for directory/contact listings
 * 
 * Behavior:
 * - If photoUrl is provided and non-empty, shows the actual photo
 * - Otherwise, shows Benjamin avatar with:
 *   - Semi-transparent color overlay (deterministic based on handle/name)
 *   - Initial letter centered on top
 */
const DirectoryAvatar = ({
  photoUrl,
  handle,
  name,
  size = 48,
  className,
}: DirectoryAvatarProps) => {
  const hasPhoto = Boolean(photoUrl && photoUrl.trim())
  
  const initial = useMemo(() => getContactInitial(handle, name), [handle, name])
  const overlayColor = useMemo(
    () => getAvatarColorForHandle(handle, name),
    [handle, name]
  )

  // Calculate font size proportionally (32px for 48px avatar)
  const fontSize = useMemo(() => Math.round((size / 48) * 32), [size])

  return (
    <div
      className={`${styles.avatarWrapper} ${className || ''}`}
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        flexShrink: 0,
      }}
      aria-label={`Avatar ${name || handle || ''}`}
    >
      {/* Benjamin base image - always present */}
      <Image
        src="/assets/avatar-profile.png"
        alt=""
        width={size}
        height={size}
        className={styles.benjaminImage}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center',
          display: 'block',
        }}
        unoptimized
      />
      
      {!hasPhoto && (
        <>
          {/* Color overlay - semi-transparent */}
          <div
            className={styles.colorOverlay}
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              backgroundColor: overlayColor,
              pointerEvents: 'none',
            }}
          />
          
          {/* Initial letter - centered on top */}
          <div className={styles.initialWrapper}>
            <span
              className={styles.initialText}
              style={{
                fontSize: `${fontSize}px`,
              }}
            >
              {initial}
            </span>
          </div>
        </>
      )}
      
      {/* Real photo - if available, render on top */}
      {hasPhoto && (
        <Image
          src={photoUrl!}
          alt=""
          width={size}
          height={size}
          className={styles.photoImage}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center',
            borderRadius: '50%',
          }}
          unoptimized
        />
      )}
    </div>
  )
}

export default memo(DirectoryAvatar)


'use client'

import Image from 'next/image'
import { memo, useMemo } from 'react'
import clsx from 'clsx'

type Props = {
  name?: string
  email?: string
  avatarUrl?: string | null
  size?: number
  rounded?: number
  className?: string
}

function getInitial(name?: string, email?: string): string {
  const fromName = (name ?? '').trim()
  if (fromName) return fromName[0]!.toUpperCase()

  const local = (email ?? '').split('@')[0] ?? ''
  if (local) return local[0]!.toUpperCase()

  return 'S' // fallback
}

const Avatar = ({ name, email, avatarUrl, size = 96, rounded = 24, className }: Props) => {
  const initial = useMemo(() => getInitial(name, email), [name, email])
  const fontSize = Math.round(size * 0.48) // 0.48 of size for proportional scaling
  const showDefault = !avatarUrl

  return (
    <div
      className={clsx('relative overflow-hidden', className)}
      style={{ 
        position: 'relative',
        width: size, 
        height: size, 
        borderRadius: rounded,
        flexShrink: 0, // Prevent shrinking
        overflow: 'hidden', // Clip initial within rounded frame
      }}
      aria-label={`Avatar ${name || email || ''}`}
    >
      {showDefault ? (
        <>
          <Image
            src="/assets/avatar-profile.png"
            alt=""
            fill
            priority={false}
            sizes={`${size}px`}
            style={{ 
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center',
              display: 'block',
              borderRadius: `${rounded}px`,
            }}
          />
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0, // Anchor to the wrapper, not the page
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 400,
              fontSize,
              lineHeight: 1,
              letterSpacing: '-0.23px',
              color: 'rgba(245, 245, 245, 0.96)',
              textShadow: '0 1px 3px rgba(0, 0, 0, 0.35)',
              zIndex: 1, // Above the image
              userSelect: 'none',
              pointerEvents: 'none', // Don't block taps
            }}
          >
            {initial}
          </span>
        </>
      ) : (
        <Image
          src={avatarUrl}
          alt=""
          fill
          priority={false}
          sizes={`${size}px`}
          style={{ 
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center',
            display: 'block',
            borderRadius: `${rounded}px`,
          }}
        />
      )}
    </div>
  )
}

export default memo(Avatar)


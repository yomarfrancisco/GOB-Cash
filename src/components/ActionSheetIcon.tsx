'use client'

import { useState } from 'react'
import Image from 'next/image'
import clsx from 'clsx'

type ActionSheetIconProps = {
  src: string
  alt: string
  fallbackLetter: string
  fallbackSrc?: string // Optional fallback image path (e.g., PNG if WebP fails)
  size?: number
  className?: string
}

/**
 * Optimized icon component with fallback
 * Shows grey circle with single letter until image loads
 */
export default function ActionSheetIcon({
  src,
  alt,
  fallbackLetter,
  fallbackSrc,
  size = 40,
  className,
}: ActionSheetIconProps) {
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [currentSrc, setCurrentSrc] = useState(src)

  const handleImageError = () => {
    if (fallbackSrc && currentSrc === src) {
      // Try fallback source
      setCurrentSrc(fallbackSrc)
      setImageError(false)
    } else {
      // Both sources failed, show letter placeholder
      setImageError(true)
      setImageLoaded(false)
    }
  }

  return (
    <div
      className={clsx('relative overflow-hidden flex-shrink-0', className)}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: imageLoaded || imageError ? 'transparent' : '#E5E5E5', // Grey circle fallback
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Fallback: Single letter placeholder */}
      {!imageLoaded && !imageError && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 500,
            fontSize: Math.round(size * 0.4),
            lineHeight: 1,
            color: '#666666',
            zIndex: 1,
            userSelect: 'none',
            pointerEvents: 'none',
          }}
        >
          {fallbackLetter}
        </span>
      )}

      {/* Image */}
      {!imageError && (
        <Image
          src={currentSrc}
          alt={alt}
          width={size}
          height={size}
          style={{
            objectFit: 'contain',
            opacity: imageLoaded ? 1 : 0,
            transition: 'opacity 0.2s ease-in-out',
          }}
          onLoad={() => setImageLoaded(true)}
          onError={handleImageError}
          priority={false} // Preload handles priority
        />
      )}
    </div>
  )
}


'use client'

import React, { useEffect, useRef } from 'react'
import ActionSheet from './ActionSheet'
import styles from './ScanQrSheet.module.css'

type ScanQrSheetProps = {
  isOpen: boolean
  onClose: () => void
}

export const ScanQrSheet: React.FC<ScanQrSheetProps> = ({ isOpen, onClose }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    if (!isOpen) {
      // Stop camera if closing
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
      return
    }

    // Guard for SSR
    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return
    }

    let cancelled = false

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        })

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }

        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
      } catch (err) {
        console.error('Error starting camera', err)
        onClose()
      }
    }

    startCamera()

    return () => {
      cancelled = true
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
    }
  }, [isOpen, onClose])

  return (
    <ActionSheet
      open={isOpen}
      title="Scan a QR code"
      onClose={onClose}
      size="tall"
      className={styles.sheet}
    >
      <div className={styles.container}>
        <video ref={videoRef} className={styles.video} playsInline muted autoPlay />
        
        {/* Dimmed mask with clear window */}
        <div className={styles.mask}>
          <div className={styles.maskRowTop} />
          <div className={styles.maskRowMiddle}>
            <div className={styles.maskColLeft} />
            <div className={styles.window}>
              <div className={styles.corners} />
            </div>
            <div className={styles.maskColRight} />
          </div>
          <div className={styles.maskRowBottom} />
        </div>
      </div>
    </ActionSheet>
  )
}


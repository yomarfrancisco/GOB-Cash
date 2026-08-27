'use client'

import React, { useEffect, useRef } from 'react'
import { startQrScanLoop } from '@/lib/scanQrFromVideo'
import styles from './ScanOverlay.module.css'

type ScanOverlayProps = {
  isOpen: boolean
  onClose: () => void
  onScan?: (text: string) => void
}

export const ScanOverlay: React.FC<ScanOverlayProps> = ({ isOpen, onClose, onScan }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan

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
    let stopScan: (() => void) | undefined

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
          if (cancelled || !videoRef.current) return
          stopScan = startQrScanLoop({
            video: videoRef.current,
            isCancelled: () => cancelled,
            onDetect: (text) => onScanRef.current?.(text),
          })
        }
      } catch (err) {
        console.error('Error starting camera', err)
        onClose()
      }
    }

    startCamera()

    return () => {
      cancelled = true
      stopScan?.()
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className={styles.overlay}>
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

      {/* Label */}
      <div className={styles.label}>Scan a QR code</div>

      {/* Close button */}
      <button
        type="button"
        className={styles.close}
        aria-label="Close scanner"
        onClick={onClose}
      >
        ×
      </button>
    </div>
  )
}


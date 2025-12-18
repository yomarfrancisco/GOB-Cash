'use client'

import { useEffect, useState } from 'react'
import { Share } from 'lucide-react'
import Image from 'next/image'
import ActionSheet from './ActionSheet'
import ActionSheetItem from './ActionSheetItem'
import { useShareProfileSheet } from '@/store/useShareProfileSheet'
import { generateQRCode } from '@/lib/qr'
import { useNotificationStore } from '@/store/notifications'
import { wallet_ensureTronAddress } from '@/lib/transactions/clientFunctions'
import Avatar from './Avatar'
import ActionSheetIcon from './ActionSheetIcon'
import styles from './ShareProfileSheet.module.css'

export default function ShareProfileSheet() {
  const { isOpen, close, subject, mode } = useShareProfileSheet()
  const pushNotification = useNotificationStore((state) => state.pushNotification)
  const [qrDataURL, setQrDataURL] = useState<string | null>(null)
  const [tronAddress, setTronAddress] = useState<string | null>(null)
  const [isLoadingTronAddress, setIsLoadingTronAddress] = useState(false)

  // Normalize handle to always have @ prefix (use fallback if no subject)
  const subjectHandle = subject?.handle?.startsWith('@') 
    ? subject.handle 
    : subject?.handle 
      ? `@${subject.handle}`
      : '@samakoyo'
  const displayHandle = subjectHandle

  // Compute payment URL once based on subject handle
  const paymentUrl = `https://gobankless.app/pay/${subjectHandle.replace(/^@/, '')}`

  // Generate QR code when sheet opens
  useEffect(() => {
    if (!isOpen || !subject) return

    const generateQR = async () => {
      try {
        const qr = await generateQRCode(paymentUrl, 512)
        setQrDataURL(qr)
      } catch (error) {
        console.error('Failed to generate QR code:', error)
        pushNotification({
          kind: 'payment_failed',
          title: 'Error',
          body: 'Failed to generate QR code',
        })
      }
    }

    generateQR()
  }, [isOpen, subject, paymentUrl, pushNotification])

  // Fetch TRON address when sheet opens (self mode only)
  useEffect(() => {
    if (!isOpen || mode !== 'self') {
      // Reset when sheet closes or not in self mode
      setTronAddress(null)
      setIsLoadingTronAddress(false)
      return
    }

    setIsLoadingTronAddress(true)
    wallet_ensureTronAddress()
      .then(data => {
        setTronAddress(data.address)
      })
      .catch(err => {
        console.error('[ShareProfileSheet] Failed to load TRON address:', err)
        setTronAddress(null)
      })
      .finally(() => {
        setIsLoadingTronAddress(false)
      })
  }, [isOpen, mode])

  // Early return if no subject (after all hooks)
  if (!subject) {
    return null
  }

  const handleShare = async () => {
    if (typeof window !== 'undefined' && navigator.share) {
      try {
        if (mode === 'self') {
          await navigator.share({
            title: 'My GoBankless Profile',
            text: `Pay me on GoBankless: ${subjectHandle}`,
            url: paymentUrl,
          })
        } else {
          await navigator.share({
            title: `${subjectHandle} on GoBankless`,
            text: `Pay ${subjectHandle} on GoBankless.`,
            url: paymentUrl,
          })
        }
      } catch (error) {
        // User cancelled or error occurred
        console.log('Share cancelled or failed:', error)
      }
    } else {
      // Fallback: copy to clipboard
      handleCopy()
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(paymentUrl)
      pushNotification({
        kind: 'payment_sent',
        title: 'Copied link',
        body: 'Payment link copied to clipboard',
      })
    } catch (error) {
      console.error('Failed to copy:', error)
      pushNotification({
        kind: 'payment_failed',
        title: 'Error',
        body: 'Failed to copy link',
      })
    }
  }

  const handleCopyTronAddress = async () => {
    if (!tronAddress) return
    try {
      await navigator.clipboard.writeText(tronAddress)
      pushNotification({
        kind: 'payment_sent',
        title: 'Copied!',
        body: 'USDT address copied to clipboard',
      })
    } catch (error) {
      console.error('Failed to copy TRON address:', error)
      pushNotification({
        kind: 'payment_failed',
        title: 'Error',
        body: 'Failed to copy address',
      })
    }
  }

  const handleShareTronAddress = async () => {
    if (!tronAddress) return
    if (typeof window !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: 'My GoBankless USDT Address',
          text: `My USDT (TRON/TRC-20) address: ${tronAddress}`,
        })
      } catch (error) {
        // User cancelled or error occurred
        console.log('Share cancelled or failed:', error)
      }
    } else {
      // Fallback: copy to clipboard
      handleCopyTronAddress()
    }
  }

  // Determine wording based on mode
  const shareTitle = 'Share profile'
  
  const shareCaption = 'Profile & payment link'

  // Use subject avatar data (only if subject exists)
  const avatarUrl = subject?.avatarUrl || undefined
  const avatarName = subject?.fullName || undefined
  const avatarEmail = undefined // Not available in subject, use undefined for fallback

  return (
    <ActionSheet open={isOpen} onClose={close} title="" size="tall" className="share-sheet">
      <div className={styles.content}>
        {/* QR Block */}
        <div className={styles.qrContainer}>
          {qrDataURL ? (
            <img src={qrDataURL} alt="QR Code" className={styles.qrImage} />
          ) : (
            <div className={styles.qrPlaceholder}>Generating QR code...</div>
          )}
        </div>

        {/* User Handle - now acts as primary title and copy target */}
        <div 
          className={styles.handleText}
          onClick={handleCopy}
          style={{ cursor: 'pointer' }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              handleCopy()
            }
          }}
          aria-label={`Copy payment link for ${displayHandle}`}
        >
          {displayHandle}
        </div>

        {/* Divider */}
        <div className={styles.divider} />

        {/* Action Rows */}
        {/* Share profile - first */}
        <ActionSheetItem
          icon={
            <div className={styles.avatarIcon}>
              <Avatar avatarUrl={avatarUrl} name={avatarName} email={avatarEmail} size={40} />
            </div>
          }
          title={shareTitle}
          caption={shareCaption}
          onClick={handleShare}
          trailing={<Share size={18} strokeWidth={2.2} style={{ color: '#111' }} />}
        />

        {/* Share USDT address - second (only for self mode) */}
        {mode === 'self' && (
          <>
            {isLoadingTronAddress ? (
              <ActionSheetItem
                icon={
                  <ActionSheetIcon
                    src="/assets/Tether.png"
                    alt="USDT"
                    fallbackLetter="U"
                    size={40}
                  />
                }
                title="Loading USDT address..."
                caption="Fetching your custodial TRON address"
                onClick={() => {}}
                trailing={<div style={{ width: 18, height: 18 }} />}
              />
            ) : tronAddress ? (
              <ActionSheetItem
                icon={
                  <ActionSheetIcon
                    src="/assets/Tether.png"
                    alt="USDT"
                    fallbackLetter="U"
                    size={40}
                  />
                }
                title="Share USDT address"
                caption="My TRON network address"
                onClick={handleShareTronAddress}
                trailing={<Share size={18} strokeWidth={2.2} style={{ color: '#111' }} />}
              />
            ) : null}
          </>
        )}
      </div>
    </ActionSheet>
  )
}

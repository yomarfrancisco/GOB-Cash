'use client'

import { useEffect, useState } from 'react'
import { Copy, AtSign, Share } from 'lucide-react'
import ActionSheet from './ActionSheet'
import ActionSheetItem from './ActionSheetItem'
import { useShareProfileSheet } from '@/store/useShareProfileSheet'
import { generateQRCode } from '@/lib/qr'
import { useNotificationStore } from '@/store/notifications'
import Avatar from './Avatar'
import styles from './ShareProfileSheet.module.css'

export default function ShareProfileSheet() {
  const { isOpen, close, subject, mode } = useShareProfileSheet()
  const pushNotification = useNotificationStore((state) => state.pushNotification)
  const [qrDataURL, setQrDataURL] = useState<string | null>(null)

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
        title: 'Copied!',
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

  // Determine wording based on mode
  const copyCaption = mode === 'self'
    ? 'Copy your personal payment URL.'
    : `Copy ${subjectHandle}'s personal payment URL.`
  
  const shareTitle = mode === 'self'
    ? 'Share my profile'
    : 'Share this profile'
  
  const shareCaption = mode === 'self'
    ? 'Send your GoBankless profile to anyone.'
    : 'Send this GoBankless profile to anyone.'

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

        {/* User Handle - now acts as primary title */}
        <div className={styles.handleText}>{displayHandle}</div>

        {/* Divider */}
        <div className={styles.divider} />

        {/* Action Rows */}
        {/* Copy payment link - first */}
        <ActionSheetItem
          icon={
            <div className={styles.avatarIcon}>
              <Avatar avatarUrl={avatarUrl} name={avatarName} email={avatarEmail} size={40} />
            </div>
          }
          title="Copy payment link"
          caption={copyCaption}
          onClick={handleCopy}
          trailing={<Copy size={18} strokeWidth={2} style={{ color: '#111' }} />}
        />

        {/* Share profile - second */}
        <ActionSheetItem
          icon={
            <div className={styles.iconCircle}>
              <AtSign size={20} strokeWidth={2.2} style={{ color: '#111' }} />
            </div>
          }
          title={shareTitle}
          caption={shareCaption}
          onClick={handleShare}
          trailing={<Share size={18} strokeWidth={2.2} style={{ color: '#111' }} />}
        />
      </div>
    </ActionSheet>
  )
}

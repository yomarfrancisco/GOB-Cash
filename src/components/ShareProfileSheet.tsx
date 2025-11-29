'use client'

import { useEffect, useState } from 'react'
import { Copy, AtSign, Share } from 'lucide-react'
import ActionSheet from './ActionSheet'
import ActionSheetItem from './ActionSheetItem'
import { useShareProfileSheet } from '@/store/useShareProfileSheet'
import { useUserProfileStore } from '@/store/userProfile'
import { generateQRCode } from '@/lib/qr'
import { useNotificationStore } from '@/store/notifications'
import Avatar from './Avatar'
import styles from './ShareProfileSheet.module.css'

export default function ShareProfileSheet() {
  const { isOpen, close } = useShareProfileSheet()
  const { profile } = useUserProfileStore()
  const pushNotification = useNotificationStore((state) => state.pushNotification)
  const [qrDataURL, setQrDataURL] = useState<string | null>(null)

  // Generate QR code when sheet opens
  useEffect(() => {
    if (!isOpen) return

    const generateQR = async () => {
      try {
        const handle = profile.userHandle || '@samakoyo'
        const paymentUrl = `https://gobankless.app/pay/${handle.replace('@', '')}`
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
  }, [isOpen, profile.userHandle, pushNotification])

  const handleShare = async () => {
    const handle = profile.userHandle || '@samakoyo'
    const paymentUrl = `https://gobankless.app/pay/${handle.replace('@', '')}`

    if (typeof window !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: 'My GoBankless Profile',
          text: `Pay me on GoBankless: ${handle}`,
          url: paymentUrl,
        })
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
    const handle = profile.userHandle || '@samakoyo'
    const paymentUrl = `https://gobankless.app/pay/${handle.replace('@', '')}`

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

  const displayHandle = profile.userHandle || '@samakoyo'

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
              <Avatar avatarUrl={profile.avatarUrl} name={profile.fullName} email={profile.email} size={40} />
            </div>
          }
          title="Copy payment link"
          caption="Copy your personal payment URL."
          onClick={handleCopy}
          trailing={<Copy size={18} strokeWidth={2} style={{ color: '#111' }} />}
        />

        {/* Share my profile - second */}
        <ActionSheetItem
          icon={
            <div className={styles.iconCircle}>
              <AtSign size={20} strokeWidth={2.2} style={{ color: '#111' }} />
            </div>
          }
          title="Share my profile"
          caption="Send your GoBankless profile to anyone."
          onClick={handleShare}
          trailing={<Share size={18} strokeWidth={2.2} style={{ color: '#111' }} />}
        />
      </div>
    </ActionSheet>
  )
}

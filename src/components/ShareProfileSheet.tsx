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
  const { isOpen, close, handle: sheetHandle, isOwnProfile } = useShareProfileSheet()
  const { profile } = useUserProfileStore()
  const pushNotification = useNotificationStore((state) => state.pushNotification)
  const [qrDataURL, setQrDataURL] = useState<string | null>(null)

  // Determine which handle to use: from sheet state (third-party) or from user profile (own)
  const targetHandle = sheetHandle || profile.userHandle || '@samakoyo'
  const displayHandle = targetHandle

  // Generate QR code when sheet opens
  useEffect(() => {
    if (!isOpen) return

    const generateQR = async () => {
      try {
        const paymentUrl = `https://gobankless.app/pay/${targetHandle.replace('@', '')}`
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
  }, [isOpen, targetHandle, pushNotification])

  const handleShare = async () => {
    const paymentUrl = `https://gobankless.app/pay/${targetHandle.replace('@', '')}`

    if (typeof window !== 'undefined' && navigator.share) {
      try {
        if (isOwnProfile) {
          await navigator.share({
            title: 'My GoBankless Profile',
            text: `Pay me on GoBankless: ${targetHandle}`,
            url: paymentUrl,
          })
        } else {
          await navigator.share({
            title: `Share ${targetHandle}'s profile`,
            text: `Check out ${targetHandle} on GoBankless`,
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
    const paymentUrl = `https://gobankless.app/pay/${targetHandle.replace('@', '')}`

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

  // Determine wording based on whether it's own profile or third-party
  const copyCaption = isOwnProfile 
    ? 'Copy your personal payment URL.' 
    : `Copy ${targetHandle}'s personal payment URL.`
  
  const shareTitle = isOwnProfile 
    ? 'Share my profile' 
    : 'Share this profile'
  
  const shareCaption = isOwnProfile
    ? 'Send your GoBankless profile to anyone.'
    : 'Send this GoBankless profile to anyone.'

  // Get avatar for display (use profile avatar for own, or fallback for third-party)
  const avatarUrl = isOwnProfile ? profile.avatarUrl : null
  const avatarName = isOwnProfile ? profile.fullName : null
  const avatarEmail = isOwnProfile ? profile.email : null

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

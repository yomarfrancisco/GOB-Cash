'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { Share2, Copy, Download, QrCode, AtSign, Share } from 'lucide-react'
import ActionSheet from './ActionSheet'
import ActionSheetItem from './ActionSheetItem'
import { useShareProfileSheet } from '@/store/useShareProfileSheet'
import { useUserProfileStore } from '@/store/userProfile'
import { generateQRCode, downloadQRCode } from '@/lib/qr'
import { useNotificationStore } from '@/store/notifications'
import Avatar from './Avatar'
import styles from './ShareProfileSheet.module.css'

// Reusable share row component
type ShareRowProps = {
  leftIcon: React.ReactNode
  title: string
  description: string
  valueToCopy: string
  toastLabel: string
}

const ShareRow: React.FC<ShareRowProps> = ({ leftIcon, title, description, valueToCopy, toastLabel }) => {
  const pushNotification = useNotificationStore((state) => state.pushNotification)

  const handleCopy = async () => {
    if (!valueToCopy) {
      pushNotification({
        kind: 'payment_failed',
        title: 'Error',
        body: 'Address not available',
      })
      return
    }

    try {
      await navigator.clipboard.writeText(valueToCopy)
      pushNotification({
        kind: 'payment_sent',
        title: 'Copied!',
        body: toastLabel,
      })
    } catch (error) {
      console.error('Failed to copy:', error)
      pushNotification({
        kind: 'payment_failed',
        title: 'Error',
        body: 'Failed to copy address',
      })
    }
  }

  return (
    <ActionSheetItem
      icon={leftIcon}
      title={title}
      caption={description}
      onClick={handleCopy}
      trailing={<Copy size={18} strokeWidth={2} style={{ color: '#111' }} />}
    />
  )
}

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

  const handleDownload = () => {
    if (!qrDataURL) {
      pushNotification({
        kind: 'payment_failed',
        title: 'Error',
        body: 'QR code not ready yet',
      })
      return
    }

    const handle = profile.userHandle || '@samakoyo'
    const filename = `gobankless-qr-${handle.replace('@', '')}.png`
    downloadQRCode(qrDataURL, filename)
    pushNotification({
      kind: 'payment_received',
      title: 'Downloaded!',
      body: 'QR code saved to your device',
    })
  }

  const displayHandle = profile.userHandle || '@samakoyo'
  const handle = profile.userHandle || '@samakoyo'
  const paymentUrl = `https://gobankless.app/pay/${handle.replace('@', '')}`

  // Card image paths
  const cardImages = {
    zar: '/assets/cards/card-savings.jpg',
    mzn: '/assets/cards/card-MZN.jpg',
    pepe: '/assets/cards/card-pepe.jpg',
    eth: '/assets/cards/card-ETH.jpg',
    btc: '/assets/cards/card-BTC.jpg',
  }

  // Placeholder addresses (TODO: wire real addresses)
  const addresses = {
    usdtSa: profile.usdtSaAddress || '0x0000000000000000000000000000000000000000', // TODO: wire real address
    usdtMzn: profile.usdtMznAddress || '0x0000000000000000000000000000000000000000', // TODO: wire real address
    pepe: profile.pepeAddress || '0x0000000000000000000000000000000000000000', // TODO: wire real address
    eth: profile.ethAddress || '0x0000000000000000000000000000000000000000', // TODO: wire real address
    btc: profile.btcAddress || 'bc1q00000000000000000000000000000000000000000000000000', // TODO: wire real address
  }

  return (
    <ActionSheet open={isOpen} onClose={close} title="" size="compact" className={styles.shareSheet}>
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

        {/* Upgraded Copy payment link row with avatar */}
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

        {/* Crypto address rows */}
        <ShareRow
          leftIcon={
            <div className={styles.cardIcon}>
              <Image
                src={cardImages.zar}
                alt="ZAR Card"
                width={40}
                height={26}
                className={styles.cardIconImage}
                unoptimized
              />
            </div>
          }
          title="Copy USDT SA address"
          description="Share this address to receive USDT from South African accounts."
          valueToCopy={addresses.usdtSa}
          toastLabel="USDT SA address copied"
        />

        <ShareRow
          leftIcon={
            <div className={styles.cardIcon}>
              <Image
                src={cardImages.mzn}
                alt="MZN Card"
                width={40}
                height={26}
                className={styles.cardIconImage}
                unoptimized
              />
            </div>
          }
          title="Copy USDT MZN address"
          description="Share this address to receive USDT from Mozambique accounts."
          valueToCopy={addresses.usdtMzn}
          toastLabel="USDT MZN address copied"
        />

        <ShareRow
          leftIcon={
            <div className={styles.cardIcon}>
              <Image
                src={cardImages.pepe}
                alt="PEPE Card"
                width={40}
                height={26}
                className={styles.cardIconImage}
                unoptimized
              />
            </div>
          }
          title="Copy PEPE address"
          description="Share this address to receive PEPE directly to this profile."
          valueToCopy={addresses.pepe}
          toastLabel="PEPE address copied"
        />

        <ShareRow
          leftIcon={
            <div className={styles.cardIcon}>
              <Image
                src={cardImages.eth}
                alt="ETH Card"
                width={40}
                height={26}
                className={styles.cardIconImage}
                unoptimized
              />
            </div>
          }
          title="Copy ETH address"
          description="Share this address to receive ETH directly to this profile."
          valueToCopy={addresses.eth}
          toastLabel="ETH address copied"
        />

        <ShareRow
          leftIcon={
            <div className={styles.cardIcon}>
              <Image
                src={cardImages.btc}
                alt="BTC Card"
                width={40}
                height={26}
                className={styles.cardIconImage}
                unoptimized
              />
            </div>
          }
          title="Copy BTC address"
          description="Share this address to receive BTC directly to this profile."
          valueToCopy={addresses.btc}
          toastLabel="BTC address copied"
        />

        <ActionSheetItem
          icon={
            <div className={styles.iconCircle}>
              <QrCode size={20} strokeWidth={2.2} style={{ color: '#111' }} />
            </div>
          }
          title="Download my QR"
          caption="Save your QR code to your device."
          onClick={handleDownload}
          trailing={<Download size={18} strokeWidth={2.2} style={{ color: '#111' }} />}
        />
      </div>
    </ActionSheet>
  )
}

'use client'

import { useEffect, useState } from 'react'
import ActionSheet from './ActionSheet'
import { useShareProfileSheet } from '@/store/useShareProfileSheet'
import { generateQRCode } from '@/lib/qr'
import { buildAgentCashUrl } from '@/lib/agentCashQr'
import { useNotificationStore } from '@/store/notifications'
import Avatar from './Avatar'
import styles from './ShareProfileSheet.module.css'

export default function ShareProfileSheet() {
  const { isOpen, close, subject } = useShareProfileSheet()
  const pushNotification = useNotificationStore((state) => state.pushNotification)
  const [qrDataURL, setQrDataURL] = useState<string | null>(null)

  const subjectHandle = subject?.handle?.startsWith('@')
    ? subject.handle
    : subject?.handle
      ? `@${subject.handle}`
      : '@samakoyo'
  const displayHandle = subjectHandle
  const cashUrl = buildAgentCashUrl(subjectHandle)

  useEffect(() => {
    if (!isOpen || !subject) return

    const generateQR = async () => {
      try {
        const qr = await generateQRCode(cashUrl, 512)
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
  }, [isOpen, subject, cashUrl, pushNotification])

  if (!subject) {
    return null
  }

  const avatarUrl = subject?.avatarUrl || undefined
  const avatarName = subject?.fullName || undefined

  return (
    <ActionSheet open={isOpen} onClose={close} title="" size="tall" className="share-sheet">
      <div className={styles.content}>
        <div className={styles.qrContainer}>
          {qrDataURL ? (
            <img src={qrDataURL} alt="QR Code" className={styles.qrImage} />
          ) : (
            <div className={styles.qrPlaceholder}>Generating QR code...</div>
          )}
        </div>

        <div className={styles.handleText}>{displayHandle}</div>

        <div className={styles.avatarWrap}>
          <Avatar avatarUrl={avatarUrl} name={avatarName} email={undefined} size={72} />
        </div>
      </div>
    </ActionSheet>
  )
}

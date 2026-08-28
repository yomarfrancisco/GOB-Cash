'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import ActionSheet from './ActionSheet'
import { useShareProfileSheet } from '@/store/useShareProfileSheet'
import { generateStyledCashIdQr } from '@/lib/qr'
import { buildAgentCashUrl } from '@/lib/agentCashQr'
import { useNotificationStore } from '@/store/notifications'
import Avatar from './Avatar'
import styles from './ShareProfileSheet.module.css'

const QR_AVATAR_SIZE = 40

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
        const qr = await generateStyledCashIdQr(cashUrl)
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
        <Image
          src="/assets/Cash_ID.png"
          alt="Cash ID"
          className={styles.titleMark}
          width={200}
          height={100}
          priority
          unoptimized
        />

        <div className={styles.qrContainer}>
          <div className={styles.qrStage}>
            {qrDataURL ? (
              <img src={qrDataURL} alt="Cash ID QR code" className={styles.qrImage} />
            ) : (
              <div className={styles.qrPlaceholder}>Generating QR code...</div>
            )}
            {qrDataURL && (
              <div className={styles.avatarOnQr}>
                <Avatar
                  avatarUrl={avatarUrl}
                  name={avatarName}
                  email={undefined}
                  size={QR_AVATAR_SIZE}
                  rounded={QR_AVATAR_SIZE / 2}
                />
              </div>
            )}
          </div>
        </div>

        <div className={styles.handleText}>{displayHandle}</div>
      </div>
    </ActionSheet>
  )
}

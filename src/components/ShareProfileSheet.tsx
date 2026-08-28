'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import ActionSheet from './ActionSheet'
import { useShareProfileSheet } from '@/store/useShareProfileSheet'
import { downloadCashIdZip } from '@/lib/cashIdPack'
import { generateStyledCashIdQr } from '@/lib/qr'
import { buildAgentCashUrl } from '@/lib/agentCashQr'
import { useNotificationStore } from '@/store/notifications'
import { useUserProfileStore } from '@/store/userProfile'
import Avatar from './Avatar'
import styles from './ShareProfileSheet.module.css'

const QR_AVATAR_SIZE = 40

export default function ShareProfileSheet() {
  const { isOpen, close, subject, mode } = useShareProfileSheet()
  const { profile } = useUserProfileStore()
  const pushNotification = useNotificationStore((state) => state.pushNotification)
  const [qrDataURL, setQrDataURL] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

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
  const fileHandle = subjectHandle.replace(/^@/, '') || 'cash-id'
  const isSelf =
    mode === 'self' ||
    profile.userHandle.replace(/^@/, '').toLowerCase() === fileHandle.toLowerCase()
  const packFullName = (subject.fullName || (isSelf ? profile.fullName : '') || '').trim()
  const packEmail = isSelf ? profile.email?.trim() : undefined
  const packWhatsapp = isSelf ? profile.whatsappUrl?.trim() : undefined

  const handleDownload = async () => {
    if (!qrDataURL || downloading) return
    setDownloading(true)
    try {
      await downloadCashIdZip({
        qrDataURL,
        profile: {
          handle: subjectHandle,
          avatarUrl,
          fullName: packFullName || undefined,
          email: packEmail || undefined,
          whatsapp: packWhatsapp || undefined,
        },
      })
    } catch (error) {
      console.error('Failed to download Cash ID:', error)
      pushNotification({
        kind: 'payment_failed',
        title: 'Error',
        body: 'Failed to download Cash ID',
      })
    } finally {
      setDownloading(false)
    }
  }

  return (
    <ActionSheet open={isOpen} onClose={close} title="" size="tall" className="share-sheet">
      <div className={styles.content}>
        <Image
          src="/assets/My-Cash-ID2.png"
          alt="My Cash ID"
          className={styles.titleMark}
          width={260}
          height={104}
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

        <button
          type="button"
          className={styles.downloadButton}
          onClick={handleDownload}
          disabled={!qrDataURL || downloading}
        >
          Download
        </button>
      </div>
    </ActionSheet>
  )
}

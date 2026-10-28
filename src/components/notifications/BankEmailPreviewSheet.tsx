'use client'

import ActionSheet from '@/components/ActionSheet'
import type { ActivityItem } from '@/store/activity'
import styles from './BankEmailRoundBlock.module.css'

type Email = NonNullable<ActivityItem['deskBankEmailRound']>['selected'][number]

export function BankEmailPreviewSheet({
  email,
  dayLabel,
  planLabel,
  open,
  onClose,
}: {
  email: Email | null
  dayLabel: string
  planLabel: string
  open: boolean
  onClose: () => void
}) {
  if (!email) return null
  return (
    <ActionSheet
      open={open}
      onClose={onClose}
      title={`Expected email · ${email.shortBank} · ${dayLabel}`}
      size="tall"
    >
      <div className={styles.sheet}>
        <div className={styles.planBanner}>{planLabel}. Expected, not sent.</div>
        <div className={styles.sheetMeta}>Would send {email.sendTimeLabel}</div>
        <dl className={styles.emailFields}>
          <div>
            <dt>Para</dt>
            <dd>{email.to}</dd>
          </div>
          <div>
            <dt>Assunto</dt>
            <dd>{email.subject}</dd>
          </div>
        </dl>
        <div className={styles.emailBody}>{email.bodyPt}</div>
        <div className={styles.attachments}>
          <div className={styles.attachmentTitle}>Anexos esperados</div>
          {email.attachments.map((attachment) => (
            <div className={styles.attachment} key={attachment.ticketId}>
              {attachment.filename}
            </div>
          ))}
        </div>
        <p className={styles.safetyNote}>
          Simulation preview only. No message or invoice has been sent.
        </p>
      </div>
    </ActionSheet>
  )
}

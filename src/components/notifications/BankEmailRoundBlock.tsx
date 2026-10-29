'use client'

import { useState } from 'react'
import type { ActivityItem } from '@/store/activity'
import styles from './BankEmailRoundBlock.module.css'

type Round = NonNullable<ActivityItem['deskBankEmailRound']>

function zar(value: number): string {
  return `R${value.toLocaleString('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function BankEmailRoundBlock({
  round,
  planLabel,
}: {
  round: Round
  planLabel: string
}) {
  const [openedBankKey, setOpenedBankKey] = useState<string | null>(null)
  if (!round.due || !round.selected.length) return null
  return (
    <section className={styles.section}>
      <div className={styles.eyebrow}>
        Bank email round · {round.selected.length} of {round.selected.length + round.notSelected.length} banks
      </div>
      <div className={styles.card}>
        {round.selected.map((email) => {
          const expanded = openedBankKey === email.bankKey
          return (
            <div className={styles.bankEntry} key={email.bankKey}>
            <button
              className={styles.bankRow}
              type="button"
              onClick={() => setOpenedBankKey(expanded ? null : email.bankKey)}
              aria-expanded={expanded}
            >
              <span className={styles.time}>{email.sendTimeLabel}</span>
              <span className={styles.bankCopy}>
                <strong>{email.shortBank}</strong>
                <span>{email.banker}</span>
                <span className={styles.reason}>Why: {email.reason}</span>
              </span>
              <strong className={styles.amount}>{zar(email.testedAmountZar)}</strong>
            </button>
              {expanded ? (
                <div className={styles.inlineEmail}>
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
              ) : null}
            </div>
          )
        })}
        {round.notSelected.length ? (
          <div className={styles.notSelected}>
            Not this round: {round.notSelected.join(', ')}
          </div>
        ) : null}
      </div>
      <div className={styles.hint}>Tap the bank row to read its expected email (Portuguese).</div>
      <div className={styles.next}>
        Replies expected {round.expectedReplyLabel} · next round {round.nextRoundLabel}
      </div>
    </section>
  )
}

export function BankExpectedRepliesBlock({
  preview,
}: {
  preview: NonNullable<ActivityItem['deskBankExpectedReplies']>
}) {
  return (
    <section className={styles.section}>
      <div className={styles.eyebrow}>Expected replies · {preview.roundLabel}</div>
      <div className={styles.card}>
        {preview.replies.rows.map((row) => (
          <div className={styles.replyRow} key={row.bankKey}>
            <div className={styles.replyHeading}>
              <span>
                <strong>{row.bank}</strong>
                <span>{row.banker}</span>
              </span>
              <strong>{zar(row.testedAmountZar)}</strong>
            </div>
            <span className={styles.expectedPill}>Expected reply</span>
            <div className={styles.learns}>Would learn: {row.wouldLearn}</div>
          </div>
        ))}
      </div>
      <p className={styles.safetyNote}>Synthetic preview. No bank response has been received.</p>
    </section>
  )
}

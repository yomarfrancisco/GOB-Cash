'use client'

import { useState } from 'react'
import type { ActivityItem } from '@/store/activity'
import { BankEmailPreviewSheet } from './BankEmailPreviewSheet'
import styles from './BankEmailRoundBlock.module.css'

type Round = NonNullable<ActivityItem['deskBankEmailRound']>
type Email = Round['selected'][number]

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
  const [opened, setOpened] = useState<Email | null>(null)
  if (!round.due || !round.selected.length) return null
  return (
    <>
      <section className={styles.section}>
        <div className={styles.eyebrow}>
          Bank email round · {round.selected.length} of {round.selected.length + round.notSelected.length} banks
        </div>
        <div className={styles.card}>
          {round.selected.map((email) => (
            <button
              className={styles.bankRow}
              key={email.bankKey}
              type="button"
              onClick={() => setOpened(email)}
            >
              <span className={styles.time}>{email.sendTimeLabel}</span>
              <span className={styles.bankCopy}>
                <strong>{email.shortBank}</strong>
                <span>{email.banker}</span>
                <span className={styles.reason}>Why: {email.reason}</span>
              </span>
              <strong className={styles.amount}>{zar(email.testedAmountZar)}</strong>
            </button>
          ))}
          {round.notSelected.length ? (
            <div className={styles.notSelected}>
              Not this round: {round.notSelected.join(', ')}
            </div>
          ) : null}
        </div>
        <div className={styles.hint}>Tap a bank to read its expected email (Portuguese).</div>
        <div className={styles.next}>
          Replies expected {round.expectedReplyLabel} · next round {round.nextRoundLabel}
        </div>
      </section>
      <BankEmailPreviewSheet
        email={opened}
        dayLabel={round.dayLabel}
        planLabel={planLabel}
        open={Boolean(opened)}
        onClose={() => setOpened(null)}
      />
    </>
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

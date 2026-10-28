'use client'

import { useState } from 'react'
import Image from 'next/image'
import type { ActivityItem } from '@/store/activity'
import type { DeskEventGroup, DeskGroupRow } from '@/lib/desk/deskEventGroups'
import { formatGroupAmount } from '@/lib/desk/deskEventGroups'
import { formatRelativeShort } from '@/lib/formatRelativeTime'
import { formatVisibleSast } from '@/lib/routing/routingTime'
import styles from '@/app/activity/activity.module.css'
import cardStyles from './DeskEventGroupCard.module.css'

function StatusChip({ label }: { label: string }) {
  return (
    <span className={styles.statusChip}>
      <CheckIcon />
      {label}
    </span>
  )
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M2.5 6.2 4.8 8.5 9.5 3.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

function bankFeedSummary(group: DeskEventGroup): string {
  const count = group.rows.length
  if (group.kind === 'other_movements') {
    const debits = group.rows.filter((row) => row.amountZar < 0).length
    const credits = group.rows.filter((row) => row.amountZar > 0).length
    if (debits === count) {
      return `${group.source} has posted ${countLabel(count, 'debit')} today.`
    }
    if (credits === count) {
      return `${group.source} has posted ${countLabel(count, 'credit')} today.`
    }
    return `${group.source} has posted ${countLabel(count, 'movement')} today — ${countLabel(
      debits,
      'debit'
    )}, ${countLabel(credits, 'credit')}.`
  }
  if (group.kind === 'swipe_matched') {
    return `${group.speaker} matched ${countLabel(count, 'card swipe')} today.`
  }
  return `${group.source} has posted ${countLabel(count, 'approved card swipe')} today.`
}

function RowLine({
  row,
  kind,
}: {
  row: DeskGroupRow
  kind: DeskEventGroup['kind']
}) {
  const [open, setOpen] = useState(false)
  const expandable = Boolean(row.detailLines?.length)
  const amountClass = [
    cardStyles.amount,
    row.amountZar < 0 ? cardStyles.amountDebit : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <>
      <button
        type="button"
        className={[cardStyles.row, expandable ? cardStyles.rowExpandable : ''].filter(Boolean).join(' ')}
        onClick={() => expandable && setOpen((v) => !v)}
        aria-expanded={expandable ? open : undefined}
      >
        <span className={cardStyles.time}>{row.timeLabel}</span>
        <span className={cardStyles.middle}>
          <span className={cardStyles.counterparty}>{row.counterparty}</span>
          {row.meta ? <span className={cardStyles.meta}>{row.meta}</span> : null}
        </span>
        <span className={cardStyles.amountCol}>
          <span className={amountClass}>{formatGroupAmount(row.amountZar, kind)}</span>
          {row.lateChip ? <span className={cardStyles.lateChip}>{row.lateChip}</span> : null}
        </span>
      </button>
      {open && row.detailLines?.length ? (
        <ul className={cardStyles.detail}>
          {row.detailLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
    </>
  )
}

function LedgerBody({ group }: { group: DeskEventGroup }) {
  const [expanded, setExpanded] = useState(true)
  const footerNoun =
    group.kind === 'zar_booked'
      ? group.rows.length === 1
        ? 'booking'
        : 'bookings'
      : group.kind === 'zar_cleared'
        ? group.rows.length === 1
          ? 'clear'
          : 'clears'
        : group.kind === 'other_movements'
          ? group.rows.length === 1
            ? 'movement'
            : 'movements'
          : group.rows.length === 1
            ? 'swipe'
            : 'swipes'

  if (group.collapsedByDefault && !expanded) {
    return (
      <div className={cardStyles.ledger}>
        <div className={cardStyles.summary}>
          <span className={cardStyles.summaryLabel}>
            {group.rows.length} {footerNoun} · net
          </span>
          <span className={cardStyles.summaryNet}>
            {formatGroupAmount(group.totalZar, group.kind)}
          </span>
        </div>
        <button
          type="button"
          className={cardStyles.toggle}
          onClick={() => setExpanded(true)}
        >
          Show {group.rows.length} movements
        </button>
      </div>
    )
  }

  return (
    <div className={cardStyles.ledger}>
      {group.collapsedByDefault ? (
        <button type="button" className={cardStyles.toggle} onClick={() => setExpanded(false)}>
          Hide movements
        </button>
      ) : null}
      {group.rows.map((row) => (
        <RowLine key={row.id} row={row} kind={group.kind} />
      ))}
      <div className={cardStyles.footer}>
        <span className={cardStyles.footerLabel}>
          Total · {group.rows.length} {footerNoun}
        </span>
        <span className={cardStyles.footerTotal}>
          {formatGroupAmount(group.totalZar, group.kind)}
        </span>
      </div>
    </div>
  )
}

export function DeskEventGroupCard({
  item,
  planBusy,
  showNext24h,
  showNext72h,
  showRealtime,
  onNext24h,
  onNext72h,
  onRealtime,
}: {
  item: ActivityItem
  planBusy?: boolean
  showNext24h?: boolean
  showNext72h?: boolean
  showRealtime?: boolean
  onNext24h?: () => void
  onNext72h?: () => void
  onRealtime?: () => void
}) {
  const group = item.deskEventGroup
  if (!group) return null

  const bankRound = group.avatarKind === 'bank' || group.avatarKind === 'digest'
  const isBankFeed = group.source !== 'wallet'
  const showPlanActions = Boolean(showNext24h || showNext72h || showRealtime)

  return (
    <article
      className={styles.activityItem}
      data-desk-item-at={item.createdAt}
      data-desk-group={group.kind}
    >
      <div
        className={[styles.activityAvatar, bankRound ? styles.activityAvatarBank : '']
          .filter(Boolean)
          .join(' ')}
      >
        {group.avatarKind === 'wallet' ? (
          <div className={cardStyles.walletMark} aria-hidden>
            ⇄
          </div>
        ) : (
          <Image
            src={group.avatarSrc}
            alt={group.speaker}
            width={44}
            height={44}
            className={bankRound ? styles.bankTileImg : styles.avatarImg}
            unoptimized
          />
        )}
      </div>
      <div className={styles.activityContent}>
        <div className={styles.msgHeaderText}>
          <div className={styles.activitySpeaker}>{group.speaker}</div>
          <div className={styles.activityHeader}>
            <div className={styles.activityTitle}>{group.title}</div>
            <div className={styles.activityTime}>
              {formatVisibleSast(group.createdAt) || formatRelativeShort(group.createdAt)}
            </div>
          </div>
        </div>
        {isBankFeed || group.statusChip ? (
          <div className={styles.chipRow}>
            {isBankFeed ? (
              <span className={`${styles.planChip} ${styles.bankFeedChip}`}>Bank feed</span>
            ) : null}
            {group.statusChip ? <StatusChip label={group.statusChip} /> : null}
          </div>
        ) : null}
        {isBankFeed ? (
          <p className={cardStyles.bankFeedSummary}>{bankFeedSummary(group)}</p>
        ) : null}
        <LedgerBody group={group} />
        {showPlanActions ? (
          <div className={styles.activityActionRow}>
            {showNext24h ? (
              <button
                type="button"
                className={[styles.replyButton, planBusy ? styles.confirmButtonLoading : '']
                  .filter(Boolean)
                  .join(' ')}
                aria-label="Simulate the next 24 hours on the desk"
                aria-busy={planBusy === true}
                disabled={planBusy === true}
                onClick={(event) => {
                  event.stopPropagation()
                  onNext24h?.()
                }}
              >
                Next 24h
              </button>
            ) : null}
            {showNext72h ? (
              <button
                type="button"
                className={[styles.replyButton, planBusy ? styles.confirmButtonLoading : '']
                  .filter(Boolean)
                  .join(' ')}
                aria-label="Simulate the next 72 hours on the desk"
                aria-busy={planBusy === true}
                disabled={planBusy === true}
                onClick={(event) => {
                  event.stopPropagation()
                  onNext72h?.()
                }}
              >
                Next 72h
              </button>
            ) : null}
            {showRealtime ? (
              <button
                type="button"
                className={[styles.replyButton, planBusy ? styles.confirmButtonLoading : '']
                  .filter(Boolean)
                  .join(' ')}
                aria-label="Return to the live desk clock"
                aria-busy={planBusy === true}
                disabled={planBusy === true}
                onClick={(event) => {
                  event.stopPropagation()
                  onRealtime?.()
                }}
              >
                Real time
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  )
}

'use client'

import { useMemo, useEffect, useState } from 'react'
import Image from 'next/image'
import { useActivityStore, type ActivityItem } from '@/store/activity'
import { subscribeToActivityEvents } from '@/lib/activity/activityEvents'
import { useAuthStore } from '@/store/auth'
import { formatRelativeShort } from '@/lib/formatRelativeTime'
import styles from '@/app/activity/activity.module.css'

const GOB_AVATAR_PATH = '/assets/aa2b32f2dc3e3a159949cb59284abddef5683b05.png'
const TASK_AVATARS = {
  paymentSent: '/assets/avatar - profile (1).png',
  paymentDelivered: '/assets/avatar - profile (2).png',
  paymentReceived: '/assets/avatar - profile (3).png',
  proofOfPayment: '/assets/Brics-girl-blue.png',
  mznDeposited: '/assets/avatar - profile (4).png',
  zarWithdrawn: '/assets/Brics-girl-blue.png',
} as const

function groupByTimePeriod(items: ActivityItem[]) {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const todayStart = startOfToday.getTime()
  const oneDay = 24 * 60 * 60 * 1000
  const yesterdayStart = todayStart - oneDay
  const last7DaysStart = todayStart - 7 * oneDay
  const last30DaysStart = todayStart - 30 * oneDay

  const today: typeof items = []
  const yesterday: typeof items = []
  const last7Days: typeof items = []
  const last30Days: typeof items = []
  const older: typeof items = []

  items.forEach((item) => {
    if (item.createdAt >= todayStart) {
      today.push(item)
    } else if (item.createdAt >= yesterdayStart) {
      yesterday.push(item)
    } else if (item.createdAt >= last7DaysStart) {
      last7Days.push(item)
    } else if (item.createdAt >= last30DaysStart) {
      last30Days.push(item)
    } else {
      older.push(item)
    }
  })

  return { today, yesterday, last7Days, last30Days, older }
}

function searchableText(item: ActivityItem): string {
  return `${item.title} ${item.body ?? ''} ${item.actor.name ?? ''}`.toLowerCase()
}

function isPaymentActivity(item: ActivityItem): boolean {
  if (
    item.kind &&
    [
      'payment_sent',
      'payment_delivered',
      'payment_received',
      'proof_of_payment',
      'mzn_deposited',
      'zar_withdrawn',
      'WITHDRAWAL_INSTRUCTED',
      'BANK_TRANSFER_CONFIRMED',
      'EXTERNAL_DEPOSIT_CONFIRMED',
      'CONVERSION_INSTRUCTED',
      'DEPOSIT_PROOF_PENDING',
      'DEPOSIT_PROOF_FAILED',
      'DEPOSIT_CREDITED',
    ].includes(item.kind)
  ) {
    return true
  }
  const text = searchableText(item)
  return [
    'payment',
    'paid',
    'delivered',
    'received',
    'proof',
    'deposit',
    'deposited',
    'withdraw',
    'withdrawn',
    'confirmed',
    'transfer',
  ].some((keyword) => text.includes(keyword))
}

function resolveTaskAvatar(item: ActivityItem): string {
  if (
    item.kind === 'proof_of_payment' ||
    item.kind === 'CONVERSION_INSTRUCTED' ||
    item.kind === 'DEPOSIT_PROOF_PENDING' ||
    item.kind === 'DEPOSIT_PROOF_FAILED'
  ) {
    return TASK_AVATARS.proofOfPayment
  }
  if (
    item.kind === 'mzn_deposited' ||
    item.kind === 'EXTERNAL_DEPOSIT_CONFIRMED' ||
    item.kind === 'DEPOSIT_CREDITED'
  ) {
    return TASK_AVATARS.mznDeposited
  }
  if (
    item.kind === 'zar_withdrawn' ||
    item.kind === 'WITHDRAWAL_INSTRUCTED' ||
    item.kind === 'BANK_TRANSFER_CONFIRMED'
  ) {
    return TASK_AVATARS.zarWithdrawn
  }
  if (item.kind === 'payment_delivered') return TASK_AVATARS.paymentDelivered
  if (item.kind === 'payment_received') return TASK_AVATARS.paymentReceived
  if (item.kind === 'payment_sent') return TASK_AVATARS.paymentSent

  const text = searchableText(item)
  if (text.includes('proof')) return TASK_AVATARS.proofOfPayment
  if (text.includes('mzn') && (text.includes('deposit') || text.includes('deposited'))) {
    return TASK_AVATARS.mznDeposited
  }
  if (text.includes('zar') && (text.includes('withdraw') || text.includes('withdrawn'))) {
    return TASK_AVATARS.zarWithdrawn
  }
  if (text.includes('delivered')) return TASK_AVATARS.paymentDelivered
  if (text.includes('received')) return TASK_AVATARS.paymentReceived
  if (text.includes('sent') || text.includes('paid')) return TASK_AVATARS.paymentSent
  return item.actor.avatarUrl || GOB_AVATAR_PATH
}

function ActivityItemCard({ item }: { item: ActivityItem }) {
  const avatarUrl = resolveTaskAvatar(item)

  return (
    <article className={styles.activityItem}>
      <div className={styles.activityAvatar}>
        <Image
          src={avatarUrl}
          alt={item.actor.name || 'Payment agent'}
          width={40}
          height={40}
          className={styles.avatarImg}
          unoptimized
        />
      </div>
      <div className={styles.activityContent}>
        <div className={styles.activityHeader}>
          <div className={styles.activityTitle}>{item.title}</div>
          <div className={styles.activityTime}>{formatRelativeShort(item.createdAt)}</div>
        </div>
        {item.body && (
          <div className={styles.activityBody}>{item.body}</div>
        )}
      </div>
    </article>
  )
}

function ActivitySection({ title, items }: { title: string; items: ActivityItem[] }) {
  if (items.length === 0) return null

  return (
    <div className={styles.activitySection}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <div className={styles.activityList}>
        {items.map((item) => (
          <ActivityItemCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  )
}

export function NotificationsList({ searchQuery = '' }: { searchQuery?: string }) {
  const clear = useActivityStore((s) => s.clear)
  const all = useActivityStore((s) => s.all)
  const isAuthed = useAuthStore((s) => s.isAuthed)
  const [remoteItems, setRemoteItems] = useState<ActivityItem[]>([])
  
  // Runtime validator: auto-clear bad data
  useEffect(() => {
    const items = all()
    const hasBadItems =
      !Array.isArray(items) ||
      items.some((it) => !it || typeof it.id !== 'string' || !Number.isFinite(it.createdAt))
    
    if (hasBadItems) {
      clear()
    }
  }, [all, clear])

  useEffect(() => {
    if (!isAuthed) {
      setRemoteItems([])
      return
    }
    const unsubscribe = subscribeToActivityEvents(setRemoteItems)
    return () => {
      unsubscribe()
    }
  }, [isAuthed])
  
  const localItems = useActivityStore((s) => s.all())
  const allItems = useMemo(() => {
    const remoteIds = new Set(remoteItems.map((item) => item.id))
    const merged = [
      ...remoteItems,
      ...localItems.filter((item) => !remoteIds.has(item.id)),
    ]
    return merged.sort((a, b) => b.createdAt - a.createdAt)
  }, [localItems, remoteItems])
  const filteredItems = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    return allItems.filter((item) => {
      if (!isPaymentActivity(item)) return false
      return !normalizedQuery || searchableText(item).includes(normalizedQuery)
    })
  }, [allItems, searchQuery])
  const { today, yesterday, last7Days, last30Days, older } = useMemo(
    () => groupByTimePeriod(filteredItems),
    [filteredItems]
  )

  return (
    <div className={styles.activityContainer}>
      <ActivitySection title="Today" items={today} />
      <ActivitySection title="Yesterday" items={yesterday} />
      <ActivitySection title="Last 7 days" items={last7Days} />
      <ActivitySection title="Last 30 days" items={last30Days} />
      <ActivitySection title="Older" items={older} />
      {filteredItems.length === 0 && (
        <p className={styles.emptyState}>
          {searchQuery.trim() ? 'No matching payment activity.' : 'No payment activity yet.'}
        </p>
      )}
    </div>
  )
}

'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { useActivityStore, type ActivityItem } from '@/store/activity'
import { formatRelativeShort } from '@/lib/formatRelativeTime'
import styles from '@/app/activity/activity.module.css'

const GOB_AVATAR_PATH = '/assets/aa2b32f2dc3e3a159949cb59284abddef5683b05.png'

function groupByTimePeriod(items: ActivityItem[]) {
  const now = Date.now()
  const oneDay = 24 * 60 * 60 * 1000
  const sevenDays = 7 * oneDay
  const thirtyDays = 30 * oneDay

  const today: typeof items = []
  const last7Days: typeof items = []
  const last30Days: typeof items = []

  items.forEach((item) => {
    const age = now - item.createdAt
    if (age <= oneDay) {
      today.push(item)
    } else if (age <= sevenDays) {
      last7Days.push(item)
    } else if (age <= thirtyDays) {
      last30Days.push(item)
    }
  })

  return { today, last7Days, last30Days }
}

function ActivityItemCard({ item }: { item: ActivityItem }) {
  const router = useRouter()

  const avatarUrl =
    item.actor.type === 'ai'
      ? GOB_AVATAR_PATH
      : item.actor.avatarUrl || GOB_AVATAR_PATH

  const handleClick = () => {
    if (item.routeOnTap) {
      router.push(item.routeOnTap)
    }
  }

  return (
    <div className={styles.activityItem} onClick={handleClick} style={{ cursor: item.routeOnTap ? 'pointer' : 'default' }}>
      <div className={styles.activityAvatar}>
        <Image
          src={avatarUrl}
          alt={item.actor.type === 'ai' ? 'AI' : item.actor.name || 'User'}
          width={38}
          height={38}
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
    </div>
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

export function NotificationsList() {
  const allItems = useActivityStore((s) => s.all())
  const { today, last7Days, last30Days } = useMemo(() => groupByTimePeriod(allItems), [allItems])

  return (
    <div className={styles.activityContainer}>
      <ActivitySection title="Today" items={today} />
      <ActivitySection title="Last 7 days" items={last7Days} />
      <ActivitySection title="Last 30 days" items={last30Days} />
    </div>
  )
}


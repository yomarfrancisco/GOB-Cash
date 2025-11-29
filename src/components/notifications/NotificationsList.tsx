'use client'

import { useMemo, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { useActivityStore, type ActivityItem } from '@/store/activity'
import { formatRelativeShort } from '@/lib/formatRelativeTime'
import styles from '@/app/activity/activity.module.css'

const GOB_AVATAR_PATH = '/assets/aa2b32f2dc3e3a159949cb59284abddef5683b05.png'

function isValidTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function groupByTimePeriod(items: ActivityItem[]) {
  if (!Array.isArray(items) || items.length === 0) {
    return {
      today: [],
      last7Days: [],
      last30Days: [],
    }
  }

  const now = Date.now()
  const oneDay = 24 * 60 * 60 * 1000
  const sevenDays = 7 * oneDay
  const thirtyDays = 30 * oneDay

  const today: ActivityItem[] = []
  const last7Days: ActivityItem[] = []
  const last30Days: ActivityItem[] = []

  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    if (!isValidTimestamp(item.createdAt)) continue

    const age = now - item.createdAt
    if (age <= oneDay) {
      today.push(item)
    } else if (age <= sevenDays) {
      last7Days.push(item)
    } else if (age <= thirtyDays) {
      last30Days.push(item)
    }
  }

  return { today, last7Days, last30Days }
}

function ActivityItemCard({ item }: { item: ActivityItem }) {
  const router = useRouter()

  if (!item || typeof item !== 'object') {
    return null
  }

  const avatarUrl =
    item.actor?.type === 'ai'
      ? GOB_AVATAR_PATH
      : item.actor?.avatarUrl || GOB_AVATAR_PATH

  const handleClick = () => {
    if (item.routeOnTap) {
      router.push(item.routeOnTap)
    }
  }

  const hasValidCreatedAt = isValidTimestamp(item.createdAt)

  return (
    <div className={styles.activityItem} onClick={handleClick} style={{ cursor: item.routeOnTap ? 'pointer' : 'default' }}>
      <div className={styles.activityAvatar}>
        <Image
          src={avatarUrl}
          alt={item.actor?.type === 'ai' ? 'AI' : item.actor?.name || 'User'}
          width={38}
          height={38}
          className={styles.avatarImg}
          unoptimized
        />
      </div>
      <div className={styles.activityContent}>
        <div className={styles.activityHeader}>
          <div className={styles.activityTitle}>{item.title || 'Notification'}</div>
          {hasValidCreatedAt && (
            <div className={styles.activityTime}>{formatRelativeShort(item.createdAt)}</div>
          )}
        </div>
        {item.body && (
          <div className={styles.activityBody}>{item.body}</div>
        )}
      </div>
    </div>
  )
}

function ActivitySection({ title, items }: { title: string; items: ActivityItem[] }) {
  if (!Array.isArray(items) || items.length === 0) return null

  return (
    <div className={styles.activitySection}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <div className={styles.activityList}>
        {items.map((item) => {
          if (!item || !item.id) return null
          return <ActivityItemCard key={item.id} item={item} />
        })}
      </div>
    </div>
  )
}

export function NotificationsList() {
  const [mounted, setMounted] = useState(false)
  const [safeItems, setSafeItems] = useState<ActivityItem[]>([])
  
  // Only access store after mount to avoid hydration issues
  useEffect(() => {
    setMounted(true)
    
    // Access store only after mount, with maximum safety
    try {
      const store = useActivityStore.getState()
      if (store && typeof store.all === 'function') {
        const items = store.all()
        setSafeItems(Array.isArray(items) ? items : [])
      }
    } catch {
      setSafeItems([])
    }
  }, [])

  // Subscribe to store changes only after mount
  useEffect(() => {
    if (!mounted) return
    
    const unsubscribe = useActivityStore.subscribe((state) => {
      try {
        if (state && typeof state.all === 'function') {
          const items = state.all()
          setSafeItems(Array.isArray(items) ? items : [])
        }
      } catch {
        setSafeItems([])
      }
    })
    
    return unsubscribe
  }, [mounted])
  const groups = useMemo(() => {
    if (!mounted) {
      return {
        today: [],
        last7Days: [],
        last30Days: [],
      }
    }
    return groupByTimePeriod(safeItems)
  }, [mounted, safeItems])

  return (
    <div className={styles.activityContainer}>
      <ActivitySection title="Today" items={groups.today} />
      <ActivitySection title="Last 7 days" items={groups.last7Days} />
      <ActivitySection title="Last 30 days" items={groups.last30Days} />
    </div>
  )
}

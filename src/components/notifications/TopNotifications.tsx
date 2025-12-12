'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import clsx from 'clsx'
import { useNotificationStore, type NotificationItem, getNotificationDetail, migrateLegacyActor } from '@/store/notifications'
import { resolveAvatarForActor, isAiManager } from '@/lib/notifications/identityResolver'
import { handleMapFromNotification } from '@/lib/notifications/mapNotificationRouter'
import { formatRelativeShort } from '@/lib/formatRelativeTime'
import { useFinancialInboxStore } from '@/state/financialInbox'
import { useAuthStore } from '@/store/auth'
import '@/styles/notifications.css'

const MAX_VISIBLE = 2
const AUTO_DISMISS_MS = 5000
const ANIMATION_DURATION_MS = 400

export default function TopNotifications() {
  const router = useRouter()
  const { notifications, dismissNotification } = useNotificationStore()
  const { isInboxOpen } = useFinancialInboxStore() // Check if financial inbox is open
  const { isAuthed, requireAuth } = useAuthStore()
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set())
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set())
  const dismissTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map())

  // Handle dismiss with exit animation
  const handleDismiss = useCallback((id: string) => {
    // Prevent double-dismissing
    if (exitingIds.has(id)) {
      return
    }

    // Clear any existing auto-dismiss timer for this notification
    const existingTimer = dismissTimersRef.current.get(id)
    if (existingTimer) {
      clearTimeout(existingTimer)
      dismissTimersRef.current.delete(id)
    }

    // Step 1: Mark as exiting to trigger exit animation
    setExitingIds((prev) => new Set(prev).add(id))

    // Step 2: After animation completes, remove from store
    setTimeout(() => {
      dismissNotification(id)
      setVisibleIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      setExitingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }, ANIMATION_DURATION_MS)
  }, [exitingIds, dismissNotification])

  // Show notifications up to MAX_VISIBLE
  useEffect(() => {
    // Exiting notifications still count towards MAX_VISIBLE
    const exiting = notifications.filter((n) => exitingIds.has(n.id))
    const nonExiting = notifications.filter((n) => !exitingIds.has(n.id))
    
    // Calculate how many slots are available for new notifications
    const availableSlots = Math.max(0, MAX_VISIBLE - exiting.length)
    const newVisible = nonExiting.slice(0, availableSlots)
    
    // Combine exiting + new visible (total never exceeds MAX_VISIBLE)
    const allVisible = [...exiting, ...newVisible]
    setVisibleIds(new Set(allVisible.map((n) => n.id)))

    // Handle map highlighting for member/co-op notifications (only non-exiting)
    newVisible.forEach((notification) => {
      if (notification.map && (notification.actor?.type === 'member' || notification.actor?.type === 'co_op')) {
        // Trigger map highlight after a short delay
        setTimeout(() => {
          handleMapFromNotification(notification)
        }, 300)
      }
    })

    // Auto-dismiss after delay (only for notifications not already exiting)
    newVisible.forEach((notification) => {
      // Skip if already has a timer or is exiting
      if (dismissTimersRef.current.has(notification.id) || exitingIds.has(notification.id)) {
        return
      }

      const timer = setTimeout(() => {
        handleDismiss(notification.id)
      }, AUTO_DISMISS_MS)

      dismissTimersRef.current.set(notification.id, timer)
    })

    // Cleanup: clear timers for notifications that are no longer visible
    return () => {
      const visibleIdsSet = new Set(allVisible.map((n) => n.id))
      dismissTimersRef.current.forEach((timer, id) => {
        if (!visibleIdsSet.has(id)) {
          clearTimeout(timer)
          dismissTimersRef.current.delete(id)
        }
      })
    }
  }, [notifications, dismissNotification, exitingIds, handleDismiss])

  const handleTap = (notification: NotificationItem) => {
    requireAuth(() => {
      // If authed, allow navigation
      if (notification.routeOnTap) {
        router.push(notification.routeOnTap)
      } else {
        router.push('/transactions')
      }
      handleDismiss(notification.id)
    })
    
    // If not authed, requireAuth will open the modal, but we still dismiss the notification
    if (!isAuthed) {
      handleDismiss(notification.id)
    }
  }

  // Dismiss handler removed - notifications auto-dismiss after 3s or on tap

  // Haptic feedback (if available)
  const triggerHaptic = () => {
    if ('vibrate' in navigator) {
      navigator.vibrate(10) // Light impact
    }
  }

  const visibleNotifications = notifications.filter((n) => visibleIds.has(n.id) || exitingIds.has(n.id))

  // Hide notifications only if there are none (don't hide when inbox is open - we'll close inbox before showing convert notifications)
  if (visibleNotifications.length === 0) {
    return null
  }

  return (
    <div className="notifications-container" role="status" aria-live="polite" aria-atomic="false">
      {visibleNotifications.map((notification, index) => {
        // Migrate legacy actor and resolve avatar
        const actor = migrateLegacyActor(notification.actor)
        const avatarUrl = resolveAvatarForActor(actor)

        // Get alt text based on identity
        const getAltText = () => {
          if (!actor) return 'Notification'
          switch (actor.type) {
            case 'ai_manager':
              return 'AI Manager'
            case 'member':
              return actor.name || 'Member'
            case 'co_op':
              return actor.name || 'Co-op'
            case 'system':
              return 'System'
            case 'user':
            default:
              return 'You'
          }
        }

        const isExiting = exitingIds.has(notification.id)
        const animationName = isExiting ? 'slideUpFadeOut' : 'slideDownFadeIn'
        const animationTiming = isExiting ? 'ease-in' : 'ease-out'
        const animationDelay = isExiting ? '0ms' : `${index * 50}ms`

        return (
          <div
            key={notification.id}
            className={clsx('notification-item', {
              'notification--ai': actor?.type === 'ai_manager',
              'notification--member': actor?.type === 'member',
              'notification--co-op': actor?.type === 'co_op',
              'notification--system': actor?.type === 'system',
              'notification--user': actor?.type === 'user',
            })}
            style={{
              animationName,
              animationDuration: `${ANIMATION_DURATION_MS}ms`,
              animationTimingFunction: animationTiming,
              animationFillMode: 'forwards',
              animationDelay,
            }}
            onClick={() => {
              triggerHaptic()
              handleTap(notification)
            }}
            onAnimationStart={() => {
              if (index === 0 && !isExiting) {
                triggerHaptic()
              }
            }}
          >
            <div className={clsx('notification-avatar', {
              'notification-avatar--ai': isAiManager(actor),
            })}>
              <Image
                src={avatarUrl}
                alt={getAltText()}
                width={38}
                height={38}
                className="notification-avatar-img"
                sizes="38px"
                quality={92}
              />
            </div>
            <div className="notification-content">
              <div className="notification-head">
                <div className="notification-title">{notification.title}</div>
                <div className="notification-meta">
                  <div className="notification-timestamp">{formatRelativeShort(notification.timestamp)}</div>
                </div>
              </div>
              {(() => {
                const detail = getNotificationDetail(notification)
                return detail ? (
                  <div className="notif__detail">{detail}</div>
                ) : null
              })()}
            </div>
          </div>
        )
      })}
    </div>
  )
}


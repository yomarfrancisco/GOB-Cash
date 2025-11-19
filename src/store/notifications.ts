import { create } from 'zustand'
import { useActivityStore } from './activity'
import { joinActionAndReason } from '@/lib/notifications/formatReason'

export type NotificationKind =
  | 'payment_sent'
  | 'payment_received'
  | 'request_sent'
  | 'payment_failed'
  | 'refund'
  | 'ai_trade'
  | 'mode-change'
  | 'transfer'

// New identity-based actor type
export type ActorIdentity =
  | { type: 'user'; id?: string; avatar?: string; name?: string }
  | { type: 'ai_manager'; id?: string; avatar?: string; name?: string }
  | { type: 'co_op'; id?: string; avatar?: string; name?: string }
  | { type: 'member'; id?: string; avatar?: string; name?: string; handle?: string }
  | { type: 'system'; id?: string; avatar?: string; name?: string }

// Legacy actor type for backward compatibility
type LegacyActor = { type: 'ai' | 'user'; avatarUrl?: string }

// Migration helper to convert legacy actors to new identity format
export const migrateLegacyActor = (
  actor?: ActorIdentity | LegacyActor
): ActorIdentity | undefined => {
  if (!actor) return undefined

  // Already new style
  if (
    actor.type === 'user' ||
    actor.type === 'ai_manager' ||
    actor.type === 'co_op' ||
    actor.type === 'member' ||
    actor.type === 'system'
  ) {
    return actor as ActorIdentity
  }

  // Legacy style
  const legacy = actor as LegacyActor
  if (legacy.type === 'ai') {
    return {
      type: 'ai_manager',
      avatar: legacy.avatarUrl ?? '/assets/Brics-girl-blue.png',
      name: 'AI manager',
    }
  }

  // legacy.type === 'user'
  return {
    type: 'user',
    avatar: legacy.avatarUrl,
    name: 'You',
  }
}

export type NotificationItem = {
  id: string // uuid
  kind: NotificationKind
  title: string // e.g., "Payment sent", "Payment received", "Payment failed", "AI trade executed"
  body?: string // detail line (non-bold) - kept for backward compatibility
  action?: string // e.g., "Rebalanced: sold 1.2 PEPE, bought 0.01 ETH."
  reason?: string // e.g., "Reason: volatility crossed 25%—moved to cash."
  amount?: {
    // optional: for later Transactions page
    currency: 'ZAR' | 'USDT'
    value: number // positive for inflow, negative for outflow
  }
  direction?: 'up' | 'down' // inflow/outflow (for Transactions derivation)
  actor?: ActorIdentity | LegacyActor // Supports both new and legacy formats
  map?: {
    lat: number
    lng: number
    markerId?: string
  }
  timestamp: number // ms since epoch
  routeOnTap?: string // e.g., '/transactions' or deep link
}

type NotificationState = {
  notifications: NotificationItem[]
  pushNotification: (item: Omit<NotificationItem, 'id' | 'timestamp'>) => void
  dismissNotification: (id: string) => void
  clearNotifications: () => void
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  pushNotification: (item) => {
    // Migrate legacy actor to new identity format
    const migratedActor = migrateLegacyActor(item.actor)
    
    const notification: NotificationItem = {
      ...item,
      actor: migratedActor,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    }
    set((state) => ({
      notifications: [...state.notifications, notification].slice(-10), // Keep max 10 in queue
    }))

    // Also add to activity store
    const activityStore = useActivityStore.getState()
    // Get detail text using the same formatter as notifications
    const detail = getNotificationDetail(notification)
    // Activity store still uses legacy format for now, convert back if needed
    const activityActor = migratedActor
      ? migratedActor.type === 'ai_manager'
        ? { type: 'ai' as const, avatarUrl: migratedActor.avatar }
        : migratedActor.type === 'user'
        ? { type: 'user' as const, avatarUrl: migratedActor.avatar }
        : { type: 'user' as const, avatarUrl: migratedActor.avatar }
      : { type: 'user' as const }
    
    activityStore.add({
      id: notification.id,
      actor: activityActor,
      title: notification.title,
      body: detail || undefined,
      amount: notification.amount
        ? {
            currency: notification.amount.currency,
            value: Math.abs(notification.amount.value),
            sign: notification.amount.value >= 0 ? 'credit' : 'debit',
          }
        : undefined,
      createdAt: notification.timestamp,
      routeOnTap: notification.routeOnTap,
    })
  },
  dismissNotification: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }))
  },
  clearNotifications: () => {
    set({ notifications: [] })
  },
}))

/**
 * Get notification detail text from action, reason, or body
 * Prefers explicit body; else joins action + reason with proper punctuation
 */
export function getNotificationDetail(n: NotificationItem): string {
  // Prefer explicit body
  if (n.body) return n.body

  // Join action + reason with proper punctuation (no ". —" sequences)
  if (n.action && n.reason) {
    return joinActionAndReason(n.action, n.reason)
  }

  // Fallback to whichever is available
  return n.action || n.reason || ''
}


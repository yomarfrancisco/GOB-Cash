/**
 * Map Notification Router
 * Handles map panning and highlighting when member/co-op notifications fire
 */

import type { NotificationItem } from '@/store/notifications'
import { useMapHighlightStore } from '@/state/mapHighlight'

/**
 * Handle map interaction from a notification
 * Only triggers for member and co-op notifications with map coordinates
 */
export function handleMapFromNotification(n: NotificationItem): void {
  // Only in demo mode
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== 'true') return

  if (!n.map) return
  if (!n.actor) return
  if (n.actor.type !== 'member' && n.actor.type !== 'co_op') return

  const { highlightOnMap } = useMapHighlightStore.getState()

  // Use markerId from notification, or derive from actor id
  const markerId = n.map.markerId || n.actor.id || n.id

  highlightOnMap({
    id: markerId,
    lat: n.map.lat,
    lng: n.map.lng,
    kind: n.actor.type,
  })
}


'use client'

import { useEffect } from 'react'
import { subscribeToActivityEvents } from '@/lib/activity/activityEvents'
import { useAuthStore } from '@/store/auth'
import { useNotificationStore } from '@/store/notifications'

const DROPDOWN_KINDS = new Set(['BANK_TRANSFER_CONFIRMED'])
const AMA_AVATAR = '/assets/Brics-girl-blue.png'

export default function ActivityEventsListener() {
  const isAuthed = useAuthStore((s) => s.isAuthed)

  useEffect(() => {
    if (!isAuthed) return

    return subscribeToActivityEvents(
      () => {},
      {
        onNew: (items) => {
          const pushNotification = useNotificationStore.getState().pushNotification
          for (const item of items) {
            if (!item.kind || !DROPDOWN_KINDS.has(item.kind)) continue
            pushNotification({
              id: item.id,
              kind: 'zar_withdrawn',
              title: item.title,
              body: item.body,
              actor: {
                type: 'ai_manager',
                avatar: AMA_AVATAR,
                name: 'Ama',
              },
              routeOnTap: '/profile?activity=1',
            })
          }
        },
      }
    )
  }, [isAuthed])

  return null
}

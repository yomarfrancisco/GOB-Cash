'use client'

import { useEffect } from 'react'
import { subscribeToActivityEvents } from '@/lib/activity/activityEvents'
import { DEPOSIT_CREDITED_KIND } from '@/lib/depositProofActivity'
import { useAuthStore } from '@/store/auth'
import { useNotificationStore } from '@/store/notifications'

const DROPDOWN_KINDS = new Set(['BANK_TRANSFER_CONFIRMED', 'EXTERNAL_DEPOSIT_CONFIRMED', DEPOSIT_CREDITED_KIND])
const DEPOSIT_AVATAR = '/assets/avatar - profile (4).png'
const WITHDRAW_AVATAR = '/assets/avatar - profile (2).png'

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
            const isWithdraw = item.kind === 'BANK_TRANSFER_CONFIRMED'
            pushNotification({
              id: item.id,
              kind: isWithdraw ? 'zar_withdrawn' : 'mzn_deposited',
              title: item.title,
              body: item.body,
              actor: {
                type: 'ai_manager',
                avatar: isWithdraw ? WITHDRAW_AVATAR : DEPOSIT_AVATAR,
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

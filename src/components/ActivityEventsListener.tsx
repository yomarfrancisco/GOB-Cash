'use client'

import { useEffect } from 'react'
import { subscribeToActivityEvents } from '@/lib/activity/activityEvents'
import { DEPOSIT_CREDITED_KIND } from '@/lib/depositProofActivity'
import { useAuthStore } from '@/store/auth'
import { useNotificationStore } from '@/store/notifications'
import { tx_sendMyWeeklySettlementStatement } from '@/lib/transactions/clientFunctions'

const DROPDOWN_KINDS = new Set([
  'BANK_TRANSFER_CONFIRMED',
  'EXTERNAL_DEPOSIT_CONFIRMED',
  DEPOSIT_CREDITED_KIND,
  'WEEKLY_SETTLEMENT_STATEMENT',
])
const DEPOSIT_AVATAR = '/assets/avatar - profile (4).png'
const WITHDRAW_AVATAR = '/assets/avatar - profile (2).png'
const ARIEL_AVATAR = '/assets/avatar-ariel.png'

export default function ActivityEventsListener() {
  const isAuthed = useAuthStore((s) => s.isAuthed)

  useEffect(() => {
    if (!isAuthed) return

    const unsubscribe = subscribeToActivityEvents(
      () => {},
      {
        onNew: (items) => {
          const pushNotification = useNotificationStore.getState().pushNotification
          for (const item of items) {
            if (!item.kind || !DROPDOWN_KINDS.has(item.kind)) continue
            const isWeekly = item.kind === 'WEEKLY_SETTLEMENT_STATEMENT'
            const isWithdraw = item.kind === 'BANK_TRANSFER_CONFIRMED'
            pushNotification({
              id: item.id,
              kind: isWeekly ? 'proof_of_payment' : isWithdraw ? 'zar_withdrawn' : 'mzn_deposited',
              title: item.title,
              body: item.body,
              actor: {
                type: 'ai_manager',
                avatar: isWeekly ? ARIEL_AVATAR : isWithdraw ? WITHDRAW_AVATAR : DEPOSIT_AVATAR,
                name: isWeekly ? '$ariel' : 'Ama',
              },
              routeOnTap: '/profile?activity=1',
            })
          }
        },
      }
    )

    const timer = window.setTimeout(() => {
      const key = 'gb.weeklySettlement.attempted'
      try {
        if (sessionStorage.getItem(key)) return
        sessionStorage.setItem(key, '1')
      } catch {
        // ignore
      }
      void tx_sendMyWeeklySettlementStatement('previous')
        .catch(() => tx_sendMyWeeklySettlementStatement('current'))
        .catch(() => {})
    }, 1600)

    return () => {
      unsubscribe()
      window.clearTimeout(timer)
    }
  }, [isAuthed])

  return null
}

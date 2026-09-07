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
const toastedWeeklyIds = new Set<string>()

function toastWeeklyStatement(id: string, title: string, body?: string) {
  if (!id || toastedWeeklyIds.has(id)) return
  toastedWeeklyIds.add(id)
  useNotificationStore.getState().pushNotification({
    id,
    kind: 'proof_of_payment',
    title,
    body,
    actor: {
      type: 'ai_manager',
      avatar: ARIEL_AVATAR,
      name: '$ariel',
    },
    routeOnTap: '/profile?activity=1',
  })
}

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
            if (item.kind === 'WEEKLY_SETTLEMENT_STATEMENT') {
              toastWeeklyStatement(item.id, item.title, item.body)
              continue
            }
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

    const timer = window.setTimeout(() => {
      void tx_sendMyWeeklySettlementStatement()
        .then((result) => {
          if (!result.posted) return
          toastWeeklyStatement(
            result.periodId,
            'Weekly settlement statement',
            `${result.conversionCount} conversion${result.conversionCount === 1 ? '' : 's'}`
          )
        })
        .catch((error) => {
          console.warn('[WeeklySettlement] Statement not posted', error)
        })
    }, 800)

    return () => {
      unsubscribe()
      window.clearTimeout(timer)
    }
  }, [isAuthed])

  return null
}

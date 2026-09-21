'use client'

import { useEffect } from 'react'
import ActionSheet from '../ActionSheet'
import { useNotificationsStore } from '@/state/notifications'
import { useActivityUnreadStore } from '@/store/activityUnread'
import { FxDeskThread } from '@/components/desk/FxDeskThread'
import listStyles from '../Inbox/FinancialInboxListSheet.module.css'

export default function NotificationsSheet() {
  const { isNotificationsOpen, closeNotifications } = useNotificationsStore()

  useEffect(() => {
    if (!isNotificationsOpen) return
    useActivityUnreadStore.getState().markSeen()
  }, [isNotificationsOpen])

  return (
    <ActionSheet
      open={isNotificationsOpen}
      onClose={closeNotifications}
      title=""
      size="tall"
      className={`${listStyles.financialInboxSheet} inboxTallSheet`}
    >
      <div className={`${listStyles.content} ${listStyles.activityContent} ${listStyles.deskContent}`}>
        <FxDeskThread />
      </div>
    </ActionSheet>
  )
}

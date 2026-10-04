'use client'

import { useEffect } from 'react'
import ActionSheet from '../ActionSheet'
import { useNotificationsStore } from '@/state/notifications'
import { useActivityUnreadStore } from '@/store/activityUnread'
import FxDeskPanel from '@/components/desk/FxDeskPanel'
import listStyles from '../Inbox/FinancialInboxListSheet.module.css'

export default function NotificationsSheet() {
  const { isNotificationsOpen, closeNotifications } = useNotificationsStore()

  useEffect(() => {
    if (!isNotificationsOpen) return
    useActivityUnreadStore.getState().markSeen()
    window.scrollTo(0, 0)
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  }, [isNotificationsOpen])

  return (
    <ActionSheet
      open={isNotificationsOpen}
      onClose={closeNotifications}
      title=""
      size="tall"
      className={`${listStyles.financialInboxSheet} inboxTallSheet fxDeskSheet`}
    >
      <FxDeskPanel />
    </ActionSheet>
  )
}

'use client'

import ActionSheet from '../ActionSheet'
import { useNotificationsStore } from '@/state/notifications'
import { NotificationsList } from './NotificationsList'
import listStyles from '../Inbox/FinancialInboxListSheet.module.css'

export default function NotificationsSheet() {
  const { isNotificationsOpen, closeNotifications } = useNotificationsStore()

  return (
    <ActionSheet
      open={isNotificationsOpen}
      onClose={closeNotifications}
      title="Notifications"
      size="tall"
      className={`${listStyles.financialInboxSheet} inboxTallSheet`}
    >
      <div className={listStyles.content}>
        <p className={listStyles.subtitle}>
          Get notified about trades, payments, and cash activity from your wallet and connected agents.
        </p>
        <div className={listStyles.divider} />
        
        {/* Notifications list - scrollable */}
        <div className={listStyles.conversationList}>
          <NotificationsList />
        </div>
      </div>
    </ActionSheet>
  )
}


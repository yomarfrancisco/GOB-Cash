'use client'

import { useState } from 'react'
import ActionSheet from '../ActionSheet'
import { useNotificationsStore } from '@/state/notifications'
import { NotificationsList } from './NotificationsList'
import listStyles from '../Inbox/FinancialInboxListSheet.module.css'

export default function NotificationsSheet() {
  const { isNotificationsOpen, closeNotifications } = useNotificationsStore()
  const [searchQuery, setSearchQuery] = useState('')

  return (
    <ActionSheet
      open={isNotificationsOpen}
      onClose={closeNotifications}
      title="Activity"
      size="tall"
      className={`${listStyles.financialInboxSheet} inboxTallSheet`}
    >
      <div className={listStyles.content}>
        <label className={listStyles.searchBar}>
          <svg
            className={listStyles.searchIcon}
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" />
            <path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search payment activity"
            className={listStyles.searchInput}
          />
        </label>
        
        <div className={listStyles.conversationList}>
          <NotificationsList searchQuery={searchQuery} />
        </div>
      </div>
    </ActionSheet>
  )
}


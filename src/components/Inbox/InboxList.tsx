'use client'

import Image from 'next/image'
import { useFinancialInboxStore } from '@/state/financialInbox'
import styles from './InboxList.module.css'

export default function InboxList() {
  const { threads, setActiveThread } = useFinancialInboxStore()

  // Sort threads: portfolio_manager first, then by lastMessageAt
  const sortedThreads = [...threads].sort((a, b) => {
    if (a.kind === 'portfolio_manager' && b.kind !== 'portfolio_manager') return -1
    if (a.kind !== 'portfolio_manager' && b.kind === 'portfolio_manager') return 1
    return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  })

  const handleThreadClick = (threadId: string) => {
    setActiveThread(threadId)
  }

  return (
    <div className={styles.inboxContainer}>
      {/* Header removed - ActionSheet provides it */}

      {/* Search bar */}
      <div className={styles.searchBar}>
        <div className={styles.searchIcon}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
            <path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="Search Stokvels"
        />
      </div>

      {/* Thread list */}
      <div className={styles.threadList}>
        {sortedThreads.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>No messages here yet</div>
            <div className={styles.emptySubtitle}>Start the conversation by sending a message</div>
          </div>
        ) : (
          sortedThreads.map((thread) => (
            <button
              key={thread.id}
              className={styles.threadRow}
              onClick={() => handleThreadClick(thread.id)}
            >
              <div className={styles.threadAvatar}>
                <Image
                  src={thread.avatarUrl}
                  alt={thread.title}
                  width={48}
                  height={48}
                  className={styles.avatarImage}
                  unoptimized
                />
              </div>
              <div className={styles.threadContent}>
                <div className={styles.threadHeader}>
                  <div className={styles.threadTitle}>{thread.title}</div>
                  <div className={styles.threadTime}>{thread.lastMessageAt}</div>
                </div>
                <div className={styles.threadFooter}>
                  <div className={styles.threadSubtitle}>{thread.subtitle}</div>
                  {thread.unreadCount > 0 && (
                    <div className={styles.unreadDot} />
                  )}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}


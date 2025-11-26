'use client'

import Image from 'next/image'
import ActionSheet from '../ActionSheet'
import { useFinancialInboxStore } from '@/state/financialInbox'
import listStyles from './FinancialInboxListSheet.module.css'
import chatStyles from './FinancialInboxChatSheet.module.css'

type FinancialInboxSheetProps = {
  onRequestAgent?: () => void // Deprecated: no longer used, kept for backward compatibility
}

/**
 * Unified Financial Inbox Sheet - switches between inbox list and chat view
 * Single ActionSheet that changes content based on inboxViewMode
 * NOTE: This sheet is now accessible from Profile → Settings → Inbox.
 * The "Request cash agent" button has been removed.
 */
export default function FinancialInboxSheet({ onRequestAgent }: FinancialInboxSheetProps) {
  const { 
    isInboxOpen, 
    inboxViewMode, 
    closeInbox, 
    openChatSheet,
    goBackToInbox 
  } = useFinancialInboxStore()

  // Cash agents data - static demo content
  const agents = [
    {
      id: 'ama',
      name: 'Ama — Investment Manager',
      avatar: '/assets/Brics-girl-blue.png',
      preview: 'Welcome! I can help you join a group or find a trusted cash agent.',
      time: '16:09',
      isOnline: true,
      unread: true,
    },
    {
      id: 'kerry',
      name: '$kerry',
      avatar: '/assets/avatar - profile (1).png',
      preview: 'Available for cash pickup in Sandton.',
      time: '15:30',
      isOnline: false,
      unread: false,
    },
    {
      id: 'simi_love',
      name: '$simi_love',
      avatar: '/assets/avatar - profile (2).png',
      preview: 'Online · can meet at your bank branch.',
      time: '14:45',
      isOnline: true,
      unread: false,
    },
    {
      id: 'ariel',
      name: '$ariel',
      avatar: '/assets/avatar - profile (3).png',
      preview: 'Verified agent · specialises in larger amounts.',
      time: '13:20',
      isOnline: false,
      unread: false,
    },
    {
      id: 'dana',
      name: '$dana',
      avatar: '/assets/avatar - profile (4).png',
      preview: 'Cash drop-off near Rosebank / Sandton.',
      time: '12:15',
      isOnline: false,
      unread: false,
    },
  ]

  const handleRowClick = (id: string) => {
    // NOTE: Row clicks are auth-gated in parent component
    // This handler only handles navigation logic after auth
    if (id === 'ama') {
      openChatSheet('portfolio-manager')
    }
    // Other rows are static for now
  }

  // Determine title based on view mode
  const sheetTitle = inboxViewMode === 'inbox' ? 'Inbox' : ''

  return (
    <ActionSheet
      open={isInboxOpen}
      onClose={closeInbox}
      title={sheetTitle}
      size="tall"
      className={`${listStyles.financialInboxSheet} inboxTallSheet`}
    >
      {inboxViewMode === 'inbox' ? (
        // Inbox list view
        <>
          <div className={listStyles.content}>
            <p className={listStyles.subtitle}>Connect with verified cash agents and community members</p>
            <div className={listStyles.divider} />
            
            {/* Search bar */}
            <div className={listStyles.searchBar}>
              <div className={listStyles.searchIcon}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
                  <path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <input
                type="text"
                className={listStyles.searchInput}
                placeholder="Search cash agents"
              />
            </div>

            {/* Agent list - scrollable */}
            <div className={listStyles.conversationList}>
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  className={listStyles.inboxRow}
                  onClick={() => handleRowClick(agent.id)}
                  type="button"
                >
                  <div className={listStyles.inboxRowLeft}>
                    <div className={listStyles.avatarWrapper}>
                      <Image
                        src={agent.avatar}
                        alt={agent.name}
                        width={64}
                        height={64}
                        className={listStyles.avatar}
                        unoptimized
                      />
                    </div>
                    <div className={listStyles.inboxTextBlock}>
                      <div className={listStyles.inboxHeader}>
                        <div className={listStyles.inboxTitle}>{agent.name}</div>
                        <div className={listStyles.inboxTimeRow}>
                          <div className={listStyles.inboxTime}>{agent.time}</div>
                          {agent.unread && (
                            <div className={listStyles.unreadDot} />
                          )}
                        </div>
                      </div>
                      <div className={listStyles.inboxPreview}>
                        {agent.preview}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* NOTE: "Request cash agent" button removed - this sheet is now read-only inbox view */}
        </>
      ) : (
        // Chat view
        <div className={chatStyles.container}>
          {/* Username row - no separate close button row, ActionSheet provides the close button */}
          <div className={chatStyles.usernameRow}>
            <button className={chatStyles.backButton} onClick={goBackToInbox} aria-label="Back">
              <Image
                src="/assets/back_ui.svg"
                alt="Back"
                width={24}
                height={24}
              />
            </button>
            <div className={chatStyles.avatar}>
              <Image
                src="/assets/Brics-girl-blue.png"
                alt="Ama — Investment Manager"
                width={38}
                height={38}
                className={chatStyles.avatarImage}
                unoptimized
              />
            </div>
            <div className={chatStyles.name}>Ama — Investment Manager</div>
          </div>

          {/* Divider line */}
          <div className={chatStyles.divider} />

          {/* Message area */}
          <div className={chatStyles.messageArea}>
            <div className={chatStyles.messageWrapper}>
              <div className={chatStyles.messageAvatar}>
                <Image
                  src="/assets/Brics-girl-blue.png"
                  alt="Baby Diamond"
                  width={31}
                  height={31}
                  className={chatStyles.messageAvatarImage}
                  unoptimized
                />
              </div>
              <div className={chatStyles.bubbleContainer}>
                <div className={chatStyles.messageBubble}>
                  Hi, I&apos;m Ama, your Investment Manager 👋   I can help you make your first deposit, find a cash agent, or convert cash to crypto.   What would you like to do first?
                </div>
                <div className={chatStyles.timestamp}>14:09</div>
              </div>
            </div>
          </div>

          {/* Input bar - no divider line above */}
          <div className={chatStyles.inputBar}>
            <button className={chatStyles.attachButton} aria-label="Attach">
              <Image
                src="/assets/attachment_diagonal.svg"
                alt="Attach"
                width={24}
                height={24}
              />
            </button>
            <input
              type="text"
              className={chatStyles.input}
              placeholder="Add a message"
            />
          </div>
        </div>
      )}
    </ActionSheet>
  )
}


/**
 * Auto Ama Intro - Helper functions for automatically showing Ama chat on landing page
 * Used for pre-sign-in demo experience
 */

import { useFinancialInboxStore } from '@/state/financialInbox'

const PORTFOLIO_MANAGER_THREAD_ID = 'portfolio-manager'

/**
 * Opens the Ama chat sheet directly (skips inbox list view)
 * Ensures the portfolio manager thread exists, opens the sheet, and sets view to chat
 */
export function openAmaIntro(): void {
  const store = useFinancialInboxStore.getState()
  
  // Ensure the portfolio manager thread exists
  store.ensurePortfolioManagerThread()
  
  // 1) Open the sheet first
  // Note: openInbox() will mark all threads as read, but for demo intro we want to show notification
  // So we'll restore unreadCount after opening
  store.openInbox()
  
  // 2) Restore unreadCount for portfolio manager thread (demo intro should show notification)
  // hasUnreadNotification will be automatically recomputed
  useFinancialInboxStore.setState((state) => {
    const newThreads = state.threads.map((t) =>
      t.id === PORTFOLIO_MANAGER_THREAD_ID ? { ...t, unreadCount: 1 } : t
    )
    const hasUnread = newThreads.some((t) => (t.unreadCount ?? 0) > 0)
    return { threads: newThreads, hasUnreadNotification: hasUnread }
  })
  
  // 3) Then set active thread and switch to chat view
  // Note: openChatSheet will mark the thread as read, so we restore unreadCount after
  store.openChatSheet(PORTFOLIO_MANAGER_THREAD_ID)
  
  // 4) Restore unreadCount again after openChatSheet marked it as read
  useFinancialInboxStore.setState((state) => {
    const newThreads = state.threads.map((t) =>
      t.id === PORTFOLIO_MANAGER_THREAD_ID ? { ...t, unreadCount: 1 } : t
    )
    const hasUnread = newThreads.some((t) => (t.unreadCount ?? 0) > 0)
    return { threads: newThreads, hasUnreadNotification: hasUnread }
  })
  
  // 5) Now mark this as a demo intro (after inbox and chat are set up)
  store.setDemoIntro(true)
  
  // Note: hasUnreadNotification is now automatically computed from thread unreadCount
}

/**
 * Closes the inbox sheet
 * Safe to call multiple times (idempotent)
 */
export function closeInboxSheet(): void {
  const store = useFinancialInboxStore.getState()
  store.closeInbox()
}


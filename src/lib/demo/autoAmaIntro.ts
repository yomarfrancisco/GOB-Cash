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
  store.openInbox()
  
  // 2) Then set active thread and switch to chat view
  // Note: openChatSheet sets activeThreadId and inboxViewMode but doesn't open the sheet
  store.openChatSheet(PORTFOLIO_MANAGER_THREAD_ID)
  
  // 3) Now mark this as a demo intro (after inbox and chat are set up)
  store.setDemoIntro(true)
  
  // 4) Set unread notification flag for bottom nav dot
  store.setHasUnreadNotification(true)
}

/**
 * Closes the inbox sheet
 * Safe to call multiple times (idempotent)
 */
export function closeInboxSheet(): void {
  const store = useFinancialInboxStore.getState()
  store.closeInbox()
}


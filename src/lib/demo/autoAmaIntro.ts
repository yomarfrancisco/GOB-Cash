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
  
  // Set demo intro flag before opening
  store.setDemoIntro(true)
  
  // Open the sheet first
  store.openInbox()
  
  // Then set active thread and switch to chat view
  // Note: openChatSheet sets activeThreadId and inboxViewMode but doesn't open the sheet
  store.openChatSheet(PORTFOLIO_MANAGER_THREAD_ID)
}

/**
 * Closes the inbox sheet
 * Safe to call multiple times (idempotent)
 */
export function closeInboxSheet(): void {
  const store = useFinancialInboxStore.getState()
  store.closeInbox()
}


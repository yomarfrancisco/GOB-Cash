/**
 * Cash Deposit/Withdrawal Chat Orchestration
 * Helper functions for opening Ama chat with cash deposit or withdrawal scenario
 */

import { useFinancialInboxStore } from '@/state/financialInbox'

const PORTFOLIO_MANAGER_THREAD_ID = 'portfolio-manager'

/**
 * Opens Ama's chat thread and ensures the cash deposit or withdrawal scenario is active
 * This is called after user submits amount in convert/helicopter flow
 */
export function openAmaChatWithScenario(scenarioType: 'cash_deposit' | 'cash_withdrawal'): void {
  const store = useFinancialInboxStore.getState()
  
  // Ensure the portfolio manager thread exists
  store.ensurePortfolioManagerThread()
  
  // Open the inbox sheet
  store.openInbox()
  
  // Switch to chat view and set active thread to Ama
  store.openChatSheet(PORTFOLIO_MANAGER_THREAD_ID)
}

/**
 * Opens Ama's chat thread for payment confirmation scenarios
 * This is called after user submits payment details from $ button flow
 */
export function openAmaChatWithPaymentScenario(
  mode: 'pay' | 'request',
  amountZAR: number,
  handle: string
): void {
  const store = useFinancialInboxStore.getState()
  
  // Ensure the portfolio manager thread exists
  store.ensurePortfolioManagerThread()
  
  // Store payment flow summary for chat to use
  // TODO: Add this to the store if needed for rendering confirmation messages
  console.log('[PAYMENT FLOW]', { mode, amountZAR, handle, timestamp: Date.now(), entryPoint: 'cashButton' })
  
  // Open the inbox sheet
  store.openInbox()
  
  // Switch to chat view and set active thread to Ama
  store.openChatSheet(PORTFOLIO_MANAGER_THREAD_ID)
  
  // TODO: Trigger scenario messages based on mode ('pay' or 'request')
  // This will be wired later when bot copy is ready
}


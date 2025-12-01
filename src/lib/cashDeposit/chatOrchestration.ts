/**
 * Cash Deposit/Withdrawal Chat Orchestration
 * Helper functions for opening Ama chat with cash deposit or withdrawal scenario
 */

import { useFinancialInboxStore, type PaymentFlowSummaryMode } from '@/state/financialInbox'
import { formatZAR } from '@/lib/money'

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
  mode: PaymentFlowSummaryMode,
  amountZAR: number,
  handle: string
): void {
  const store = useFinancialInboxStore.getState()
  
  // Store payment flow summary
  const id = `${Date.now()}-${mode}-${handle}`
  store.setLastPaymentFlow({
    id,
    mode,
    amountZAR,
    handle,
    createdAt: Date.now(),
  })
  
  // Ensure the portfolio manager thread exists
  store.ensurePortfolioManagerThread()
  
  // Format amount for display
  const amountLabel = formatZAR(amountZAR)
  
  // Seed initial confirmation messages based on mode
  if (mode === 'pay') {
    // Send first message immediately
    store.sendMessage(PORTFOLIO_MANAGER_THREAD_ID, 'ai', `Payment sent`)
    
    // Send remaining messages with delays to simulate typing
    setTimeout(() => {
      store.sendMessage(PORTFOLIO_MANAGER_THREAD_ID, 'ai', `Your payment of ${amountLabel} to ${handle} has been sent successfully.`)
    }, 800)
    
    setTimeout(() => {
      store.sendMessage(PORTFOLIO_MANAGER_THREAD_ID, 'ai', `I'll generate a proof of payment for you here in a moment.`)
    }, 1600)
  } else {
    // Send first message immediately
    store.sendMessage(PORTFOLIO_MANAGER_THREAD_ID, 'ai', `Payment request created`)
    
    // Send remaining messages with delays to simulate typing
    setTimeout(() => {
      store.sendMessage(PORTFOLIO_MANAGER_THREAD_ID, 'ai', `Your request for ${amountLabel} from ${handle} has been sent.`)
    }, 800)
  }
  
  // Open the inbox sheet
  store.openInbox()
  
  // Switch to chat view and set active thread to Ama
  store.openChatSheet(PORTFOLIO_MANAGER_THREAD_ID)
}

/**
 * Opens Ama's chat thread for card deposit confirmation scenarios
 * This is called after user selects destination account for card deposit
 */
export function openAmaChatWithCardDepositScenario(
  amountZAR: number,
  accountLabel: string
): void {
  const store = useFinancialInboxStore.getState()
  
  // Ensure the portfolio manager thread exists
  store.ensurePortfolioManagerThread()
  
  // Format amount for display
  const amountLabel = formatZAR(amountZAR)
  
  // Seed initial confirmation messages
  // Send first message immediately
  store.sendMessage(PORTFOLIO_MANAGER_THREAD_ID, 'ai', `I've started your card deposit.`)
  
  // Send remaining messages with delays to simulate typing
  setTimeout(() => {
    store.sendMessage(PORTFOLIO_MANAGER_THREAD_ID, 'ai', `Your card deposit of ${amountLabel} into ${accountLabel} has been initiated.`)
  }, 800)
  
  setTimeout(() => {
    store.sendMessage(PORTFOLIO_MANAGER_THREAD_ID, 'ai', `The funds should appear in your account shortly.`)
  }, 1600)
  
  // Open the inbox sheet
  store.openInbox()
  
  // Switch to chat view and set active thread to Ama
  store.openChatSheet(PORTFOLIO_MANAGER_THREAD_ID)
}

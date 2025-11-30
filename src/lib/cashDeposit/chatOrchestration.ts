/**
 * Cash Deposit/Withdrawal Chat Orchestration
 * Helper functions for opening Ama chat with cash deposit or withdrawal scenario
 */

import { useFinancialInboxStore, type PaymentFlowSummaryMode } from '@/state/financialInbox'
import { nanoid } from 'nanoid'
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
  const messages: Array<{ id: string; threadId: string; from: 'user' | 'ai'; text: string; createdAt: string }> = []
  
  if (mode === 'pay') {
    messages.push(
      {
        id: nanoid(),
        threadId: PORTFOLIO_MANAGER_THREAD_ID,
        from: 'ai',
        text: `Payment sent`,
        createdAt: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      },
      {
        id: nanoid(),
        threadId: PORTFOLIO_MANAGER_THREAD_ID,
        from: 'ai',
        text: `Your payment of ${amountLabel} to ${handle} has been sent successfully.`,
        createdAt: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      },
      {
        id: nanoid(),
        threadId: PORTFOLIO_MANAGER_THREAD_ID,
        from: 'ai',
        text: `I'll generate a proof of payment for you here in a moment.`,
        createdAt: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      }
    )
  } else {
    messages.push(
      {
        id: nanoid(),
        threadId: PORTFOLIO_MANAGER_THREAD_ID,
        from: 'ai',
        text: `Payment request created`,
        createdAt: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      },
      {
        id: nanoid(),
        threadId: PORTFOLIO_MANAGER_THREAD_ID,
        from: 'ai',
        text: `Your request for ${amountLabel} from ${handle} has been sent.`,
        createdAt: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      }
    )
  }
  
  // Add messages to the thread
  const existingMessages = store.messagesByThreadId[PORTFOLIO_MANAGER_THREAD_ID] || []
  store.sendMessage(PORTFOLIO_MANAGER_THREAD_ID, 'ai', messages[0].text)
  
  // Add remaining messages with a small delay to simulate typing
  messages.slice(1).forEach((msg, index) => {
    setTimeout(() => {
      store.sendMessage(PORTFOLIO_MANAGER_THREAD_ID, 'ai', msg.text)
    }, (index + 1) * 800) // 800ms delay between messages
  })
  
  // Open the inbox sheet
  store.openInbox()
  
  // Switch to chat view and set active thread to Ama
  store.openChatSheet(PORTFOLIO_MANAGER_THREAD_ID)
}


/**
 * Financial Inbox State
 * Manages threads and messages for the financial inbox system
 */

import { create } from 'zustand'
import { nanoid } from 'nanoid'

export type ThreadId = string

export type Thread = {
  id: ThreadId
  title: string
  subtitle: string
  avatarUrl: string
  unreadCount: number
  lastMessageAt: string // ISO or "14:09"
  kind: 'portfolio_manager' | 'peer'
}

export type ChatMessage = {
  id: string
  threadId: ThreadId
  from: 'user' | 'ai'
  text: string
  createdAt: string
}

export type InboxViewMode = 'inbox' | 'chat'

export type CashDepositScenario = {
  amountZAR: number
  startedAt: number
}

export type CashWithdrawalScenario = {
  amountZAR: number
  startedAt: number
}

export type ScenarioType = 'deposit' | 'withdrawal' | null

export type PaymentFlowSummaryMode = 'pay' | 'request'

export interface PaymentFlowSummary {
  id: string // uuid or timestamp-based
  mode: PaymentFlowSummaryMode
  amountZAR: number
  handle: string // '@samakoyo'
  createdAt: number // Date.now()
}

type FinancialInboxState = {
  threads: Thread[]
  messagesByThreadId: Record<ThreadId, ChatMessage[]>
  activeThreadId: ThreadId | null
  isInboxOpen: boolean
  inboxViewMode: InboxViewMode // 'inbox' or 'chat' - controls which view to show
  isDemoIntro: boolean // True when opened from landing demo auto-intro
  hasUnreadNotification: boolean // True when there's an unread notification (for bottom nav dot)
  cashDepositScenario: CashDepositScenario | null // Active cash deposit scenario
  cashWithdrawalScenario: CashWithdrawalScenario | null // Active cash withdrawal scenario
  lastPaymentFlow: PaymentFlowSummary | null // Latest payment flow summary
  openInbox: () => void
  closeInbox: () => void
  openChatSheet: (threadId: ThreadId) => void // Open chat sheet for a specific thread
  goBackToInbox: () => void // Go back to inbox view without closing sheet
  sendMessage: (threadId: ThreadId, from: 'user' | 'ai', text: string) => void
  setActiveThread: (threadId: ThreadId | null) => void
  ensurePortfolioManagerThread: () => void
  setDemoIntro: (value: boolean) => void // Set demo intro flag
  setHasUnreadNotification: (value: boolean) => void // Set unread notification flag
  startCashDepositScenario: (amountZAR: number) => void
  endCashDepositScenario: () => void
  startCashWithdrawalScenario: (amountZAR: number) => void
  endCashWithdrawalScenario: () => void
  scenarioType: ScenarioType
  setLastPaymentFlow: (summary: PaymentFlowSummary) => void
}

export const PORTFOLIO_MANAGER_THREAD_ID = 'portfolio-manager'

// Initial seed messages for Portfolio Manager
const initialPMMessages: ChatMessage[] = [
  {
    id: nanoid(),
    threadId: PORTFOLIO_MANAGER_THREAD_ID,
    from: 'ai',
    text: 'Hi, I\'m Ama, your Stokvel Treasurer 👋   I can help you make your first deposit, join a Stokvel, or start a new group with friends.   What would you like to do first?',
    createdAt: '14:09',
  },
]

// Helper: Compute hasUnreadNotification from thread state
const recomputeHasUnread = (threads: Thread[]): boolean => {
  return threads.some((t) => (t.unreadCount ?? 0) > 0)
}

// Initial threads
const initialThreads: Thread[] = [
  {
    id: PORTFOLIO_MANAGER_THREAD_ID,
    title: 'Ama — Stokvel Treasurer',
    subtitle: 'Welcome! I can help you join or start a Stokvel.',
    avatarUrl: '/assets/Brics-girl-blue.png',
    unreadCount: 1, // Mark as unread with blue dot
    lastMessageAt: '16:09',
    kind: 'portfolio_manager',
  },
]

export const useFinancialInboxStore = create<FinancialInboxState>((set, get) => ({
  threads: initialThreads,
  messagesByThreadId: {
    [PORTFOLIO_MANAGER_THREAD_ID]: initialPMMessages,
  },
  activeThreadId: null,
  isInboxOpen: false,
  inboxViewMode: 'inbox',
  isDemoIntro: false,
  hasUnreadNotification: recomputeHasUnread(initialThreads), // Compute from initial threads
  cashDepositScenario: null,
  cashWithdrawalScenario: null,
  scenarioType: null,
  lastPaymentFlow: null,

  ensurePortfolioManagerThread: () => {
    const state = get()
    const pmThread = state.threads.find((t) => t.id === PORTFOLIO_MANAGER_THREAD_ID)
    if (!pmThread) {
      set((state) => {
        const newThreads = [
          {
            id: PORTFOLIO_MANAGER_THREAD_ID,
            title: 'Ama — Stokvel Treasurer',
            subtitle: 'Welcome! I can help you join or start a Stokvel.',
            avatarUrl: '/assets/Brics-girl-blue.png',
            unreadCount: 0,
            lastMessageAt: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
            kind: 'portfolio_manager',
          },
          ...state.threads,
        ]
        const hasUnread = recomputeHasUnread(newThreads)
        console.log('[Inbox] hasUnreadNotification', hasUnread, 'threads with unread:', newThreads.filter((t) => (t.unreadCount ?? 0) > 0).length)
        return {
          threads: newThreads,
          hasUnreadNotification: hasUnread,
        }
      })
    }
    if (!state.messagesByThreadId[PORTFOLIO_MANAGER_THREAD_ID]) {
      set((state) => ({
        messagesByThreadId: {
          ...state.messagesByThreadId,
          [PORTFOLIO_MANAGER_THREAD_ID]: initialPMMessages,
        },
      }))
    }
  },

  openInbox: () => {
    set((state) => {
      // When inbox is opened, mark all threads as read (set unreadCount to 0)
      const updatedThreads = state.threads.map((t) => ({
        ...t,
        unreadCount: 0,
      }))
      const hasUnread = recomputeHasUnread(updatedThreads)
      console.log('[Inbox] hasUnreadNotification', hasUnread, 'threads with unread:', updatedThreads.filter((t) => (t.unreadCount ?? 0) > 0).length)
      return {
        ...state,
        isInboxOpen: true,
        inboxViewMode: 'inbox', // Always start with inbox view
        threads: updatedThreads,
        hasUnreadNotification: hasUnread, // Recompute from updated threads
        // Preserve isDemoIntro - it will be controlled explicitly by callers
      }
    })
  },

  closeInbox: () => {
    set({
      isInboxOpen: false,
      activeThreadId: null,
      inboxViewMode: 'inbox', // Reset to inbox when closing
      isDemoIntro: false, // Reset demo intro flag on close
    })
  },

  openChatSheet: (threadId: ThreadId) => {
    set((state) => {
      // Mark the opened thread as read (set unreadCount to 0)
      const updatedThreads = state.threads.map((t) =>
        t.id === threadId ? { ...t, unreadCount: 0 } : t
      )
      const hasUnread = recomputeHasUnread(updatedThreads)
      console.log('[Inbox] hasUnreadNotification', hasUnread, 'threads with unread:', updatedThreads.filter((t) => (t.unreadCount ?? 0) > 0).length)
      return {
        activeThreadId: threadId,
        inboxViewMode: 'chat', // Switch to chat view, keep sheet open
        threads: updatedThreads,
        hasUnreadNotification: hasUnread,
      }
    })
  },

  goBackToInbox: () => {
    set({
      inboxViewMode: 'inbox', // Go back to inbox view, keep sheet open
    })
  },

  setActiveThread: (threadId: ThreadId | null) => {
    set({ activeThreadId: threadId })
  },

  setDemoIntro: (value: boolean) => {
    set({ isDemoIntro: value })
  },

  setHasUnreadNotification: (value: boolean) => {
    set({ hasUnreadNotification: value })
  },

  startCashDepositScenario: (amountZAR: number) => {
    console.debug('[SCENARIO] startCashDepositScenario called', { amountZAR, stack: new Error().stack })
    set((state) => {
      const next = {
        ...state,
        cashDepositScenario: {
          amountZAR,
          startedAt: Date.now(),
        },
        cashWithdrawalScenario: null, // Clear withdrawal when starting deposit
        scenarioType: 'deposit' as const,
      }
      console.log('[DEBUG] store after startCashDepositScenario', {
        cashDepositScenario: next.cashDepositScenario,
        cashWithdrawalScenario: next.cashWithdrawalScenario,
        scenarioType: next.scenarioType,
      })
      return next
    })
  },

  endCashDepositScenario: () => {
    set({ cashDepositScenario: null })
  },

  startCashWithdrawalScenario: (amountZAR: number) => {
    console.debug('[SCENARIO] startCashWithdrawalScenario called', { amountZAR, stack: new Error().stack })
    set((state) => {
      const next = {
        ...state,
        cashWithdrawalScenario: {
          amountZAR,
          startedAt: Date.now(),
        },
        cashDepositScenario: null, // Clear deposit when starting withdrawal
        scenarioType: 'withdrawal' as const,
      }
      console.log('[DEBUG] store after startCashWithdrawalScenario', {
        cashDepositScenario: next.cashDepositScenario,
        cashWithdrawalScenario: next.cashWithdrawalScenario,
        scenarioType: next.scenarioType,
      })
      return next
    })
  },

  endCashWithdrawalScenario: () => {
    set({ cashWithdrawalScenario: null, scenarioType: null })
  },

  setLastPaymentFlow: (summary: PaymentFlowSummary) => {
    set({ lastPaymentFlow: summary })
  },

  sendMessage: (threadId: ThreadId, from: 'user' | 'ai', text: string) => {
    const state = get()
    const message: ChatMessage = {
      id: nanoid(),
      threadId,
      from,
      text,
      createdAt: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    }

    // Add message to thread
    const threadMessages = state.messagesByThreadId[threadId] || []
    set({
      messagesByThreadId: {
        ...state.messagesByThreadId,
        [threadId]: [...threadMessages, message],
      },
    })

    // Update thread subtitle and timestamp
    const thread = state.threads.find((t) => t.id === threadId)
    if (thread) {
      const updatedThreads = state.threads.map((t) =>
        t.id === threadId
          ? {
              ...t,
              subtitle: text.length > 60 ? text.substring(0, 60) + '...' : text,
              lastMessageAt: message.createdAt,
              unreadCount: from === 'ai' ? t.unreadCount + 1 : t.unreadCount,
            }
          : t
      )
      const hasUnread = recomputeHasUnread(updatedThreads)
      console.log('[Inbox] hasUnreadNotification', hasUnread, 'threads with unread:', updatedThreads.filter((t) => (t.unreadCount ?? 0) > 0).length)
      set({ threads: updatedThreads, hasUnreadNotification: hasUnread })
    }
  },
}))


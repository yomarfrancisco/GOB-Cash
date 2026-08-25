import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type ActivityItem = {
  id: string
  kind?:
    | 'payment_sent'
    | 'payment_delivered'
    | 'payment_received'
    | 'proof_of_payment'
    | 'mzn_deposited'
    | 'zar_withdrawn'
    | 'WITHDRAWAL_INSTRUCTED'
    | 'BANK_TRANSFER_CONFIRMED'
    | string
  actor: { type: 'ai' | 'user' | 'counterparty'; name?: string; avatarUrl?: string }
  title: string
  body?: string
  amount?: { currency: 'MZN' | 'ZAR' | 'USDT'; value: number; sign: 'credit' | 'debit' }
  createdAt: number
  routeOnTap?: string
}

const MAX_ACTIVITY_ITEMS = 80

function capItems(items: ActivityItem[]): ActivityItem[] {
  return [...items]
    .filter((item) => item && typeof item.id === 'string' && Number.isFinite(item.createdAt))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_ACTIVITY_ITEMS)
}

const quotaSafeStorage = createJSONStorage(() => ({
  getItem: (name) => {
    try {
      return localStorage.getItem(name)
    } catch {
      return null
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value)
    } catch {
      try {
        localStorage.removeItem(name)
        localStorage.setItem(name, value)
      } catch {
        // In-memory activity still works; Firebase is the source of truth.
      }
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name)
    } catch {
      // ignore
    }
  },
}))

type ActivityState = {
  items: ActivityItem[]
  add: (item: ActivityItem) => void
  addMany: (items: ActivityItem[]) => void
  clear: () => void
  all: () => ActivityItem[]
}

export const useActivityStore = create<ActivityState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (item) => set({ items: capItems([item, ...get().items]) }),
      addMany: (arr) => set({ items: capItems([...arr, ...get().items]) }),
      clear: () => set({ items: [] }),
      all: () => {
        try {
          const state = get()
          const items = state?.items
          return Array.isArray(items) ? items : []
        } catch {
          return []
        }
      },
    }),
    {
      name: 'activity-store-v2',
      version: 3,
      storage: quotaSafeStorage,
      partialize: (state) => ({ items: state.items }),
      migrate: (persisted) => {
        const state = persisted as { items?: ActivityItem[] }
        return { items: capItems(Array.isArray(state?.items) ? state.items : []) }
      },
    }
  )
)


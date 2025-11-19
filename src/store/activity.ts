import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ActivityItem = {
  id: string
  actor: { type: 'ai' | 'user' | 'counterparty'; name?: string; avatarUrl?: string }
  title: string
  body?: string
  amount?: { currency: 'ZAR' | 'USDT'; value: number; sign: 'credit' | 'debit' }
  createdAt: number
  routeOnTap?: string
}

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
      add: (item) => set({ items: [item, ...get().items].sort((a, b) => b.createdAt - a.createdAt) }),
      addMany: (arr) => set({ items: [...arr, ...get().items].sort((a, b) => b.createdAt - a.createdAt) }),
      clear: () => set({ items: [] }),
      all: () => get().items,
    }),
    { name: 'activity-store-v1' }
  )
)


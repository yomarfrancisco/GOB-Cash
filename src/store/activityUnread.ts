import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

type ActivityUnreadState = {
  lastSeenAt: number
  latestAt: number
  seeded: boolean
  syncLatest: (latestAt: number) => void
  markSeen: () => void
  reset: () => void
}

const storage = createJSONStorage(() => ({
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
      // Ignore quota errors; the live session still tracks unread.
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

let pendingLatestAt: number | null = null

export const useActivityUnreadStore = create<ActivityUnreadState>()(
  persist(
    (set, get) => ({
      lastSeenAt: 0,
      latestAt: 0,
      seeded: false,
      syncLatest: (latestAt) => {
        if (!useActivityUnreadStore.persist.hasHydrated()) {
          pendingLatestAt = latestAt
          return
        }
        if (!latestAt) {
          set({ latestAt: 0 })
          return
        }
        if (!get().seeded) {
          set({ latestAt, lastSeenAt: latestAt, seeded: true })
          return
        }
        set({ latestAt: Math.max(latestAt, get().latestAt) })
      },
      markSeen: () => {
        const latestAt = Math.max(get().latestAt, Date.now())
        set({ lastSeenAt: latestAt, latestAt })
      },
      reset: () => {
        pendingLatestAt = null
        set({ lastSeenAt: 0, latestAt: 0, seeded: false })
      },
    }),
    {
      name: 'activity-unread-v1',
      storage,
      partialize: (state) => ({
        lastSeenAt: state.lastSeenAt,
        latestAt: state.latestAt,
        seeded: state.seeded,
      }),
      onRehydrateStorage: () => () => {
        if (pendingLatestAt == null) return
        const latestAt = pendingLatestAt
        pendingLatestAt = null
        useActivityUnreadStore.getState().syncLatest(latestAt)
      },
    }
  )
)

export function selectHasUnseenLiquidityActivity(state: ActivityUnreadState): boolean {
  return state.seeded && state.latestAt > state.lastSeenAt
}

export const LIQUIDITY_MANAGER_ACTIVITY_KINDS = new Set([
  'CONVERSION_ROUTING_INSTRUCTION',
  'CONVERSION_INSTRUCTED',
  'WEEKLY_SETTLEMENT_STATEMENT',
  'MONTHLY_SETTLEMENT_STATEMENT',
])

export function isLiquidityManagerActivity(item: { kind?: string; thinking?: boolean }): boolean {
  if (item.thinking) return false
  return Boolean(item.kind && LIQUIDITY_MANAGER_ACTIVITY_KINDS.has(item.kind))
}

export function latestLiquidityActivityAt(
  items: Array<{ kind?: string; thinking?: boolean; createdAt: number }>
): number {
  return items.reduce((latest, item) => {
    if (!isLiquidityManagerActivity(item) || !Number.isFinite(item.createdAt)) return latest
    return Math.max(latest, item.createdAt)
  }, 0)
}

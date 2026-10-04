import { create } from 'zustand'
import type { ConversionRoutingSummary } from '@/lib/transactions/clientFunctions'

type DeskPlanState = {
  mode: 'live' | 'planned'
  plannedClockMs: number | null
  busy: boolean
  applySummary: (summary: ConversionRoutingSummary | null | undefined) => void
  setBusy: (busy: boolean) => void
  setLive: () => void
}

export const useDeskPlanStore = create<DeskPlanState>((set) => ({
  mode: 'live',
  plannedClockMs: null,
  busy: false,
  applySummary: (summary) =>
    set({
      mode: summary?.deskMode === 'planned' ? 'planned' : 'live',
      plannedClockMs:
        typeof summary?.plannedClockMs === 'number' && summary.plannedClockMs > 0
          ? summary.plannedClockMs
          : null,
    }),
  setBusy: (busy) => set({ busy }),
  setLive: () => set({ mode: 'live' }),
}))

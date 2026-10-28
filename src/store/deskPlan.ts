import { create } from 'zustand'
import type { ConversionRoutingSummary } from '@/lib/transactions/clientFunctions'

type DeskPlanState = {
  mode: 'live' | 'planned'
  plannedClockMs: number | null
  plannedHorizonHours: 24 | 72 | null
  plannedAnchorCycle: number | null
  busy: boolean
  applySummary: (summary: ConversionRoutingSummary | null | undefined) => void
  setBusy: (busy: boolean) => void
  setLive: () => void
}

export const useDeskPlanStore = create<DeskPlanState>((set) => ({
  mode: 'live',
  plannedClockMs: null,
  plannedHorizonHours: null,
  plannedAnchorCycle: null,
  busy: false,
  applySummary: (summary) =>
    set({
      mode: summary?.deskMode === 'planned' ? 'planned' : 'live',
      plannedClockMs:
        typeof summary?.plannedClockMs === 'number' && summary.plannedClockMs > 0
          ? summary.plannedClockMs
          : null,
      plannedHorizonHours:
        summary?.deskMode === 'planned'
          ? Number(summary?.plannedHorizonHours) >= 72
            ? 72
            : 24
          : null,
      plannedAnchorCycle:
        typeof summary?.plannedAnchorCycle === 'number' && summary.plannedAnchorCycle > 0
          ? summary.plannedAnchorCycle
          : typeof summary?.simulatedFromCycle === 'number' && summary.simulatedFromCycle > 0
            ? summary.simulatedFromCycle
            : null,
    }),
  setBusy: (busy) => set({ busy }),
  setLive: () =>
    set({ mode: 'live', plannedClockMs: null, plannedHorizonHours: null, plannedAnchorCycle: null }),
}))

import { create } from 'zustand'
import type { ConversionRoutingSummary } from '@/lib/transactions/clientFunctions'

type DeskPlanState = {
  mode: 'live' | 'planned'
  plannedClockMs: number | null
  plannedHorizonHours: 24 | 72 | null
  plannedAnchorCycle: number | null
  /** Active Planned run id — feed hides simulated rows from other runs. */
  planRunId: string | null
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
  planRunId: null,
  busy: false,
  applySummary: (summary) =>
    set((prev) => {
      const planned = summary?.deskMode === 'planned'
      const nextRun =
        typeof summary?.planRunId === 'string' && summary.planRunId.trim()
          ? summary.planRunId.trim()
          : null
      return {
        mode: planned ? 'planned' : 'live',
        plannedClockMs:
          typeof summary?.plannedClockMs === 'number' && summary.plannedClockMs > 0
            ? summary.plannedClockMs
            : null,
        plannedHorizonHours: planned
          ? Number(summary?.plannedHorizonHours) >= 72
            ? 72
            : 24
          : null,
        plannedAnchorCycle: planned
          ? typeof summary?.plannedAnchorCycle === 'number' && summary.plannedAnchorCycle > 0
            ? summary.plannedAnchorCycle
            : typeof summary?.simulatedFromCycle === 'number' && summary.simulatedFromCycle > 0
              ? summary.simulatedFromCycle
              : null
          : null,
        // Keep the active run id across thin keypad/day-close summaries.
        planRunId: planned ? nextRun || prev.planRunId : null,
      }
    }),
  setBusy: (busy) => set({ busy }),
  setLive: () =>
    set({
      mode: 'live',
      plannedClockMs: null,
      plannedHorizonHours: null,
      plannedAnchorCycle: null,
      planRunId: null,
    }),
}))

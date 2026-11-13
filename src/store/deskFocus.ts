import { create } from 'zustand'

type DeskFocusState = {
  focusAt: number | null
  focusCycle: number | null
  /** 0 = large header visible (latest or feed start), 1 = header hidden mid-feed. */
  headerCompact: number
  setFocus: (focusAt: number | null, focusCycle?: number | null) => void
  setHeaderCompact: (compact: number) => void
}

export const useDeskFocusStore = create<DeskFocusState>((set) => ({
  focusAt: null,
  focusCycle: null,
  headerCompact: 0,
  setFocus: (focusAt, focusCycle = null) => set({ focusAt, focusCycle }),
  setHeaderCompact: (compact) => {
    const next = Math.max(0, Math.min(1, Number(compact) || 0))
    set((state) => (Math.abs(state.headerCompact - next) < 0.004 ? state : { headerCompact: next }))
  },
}))

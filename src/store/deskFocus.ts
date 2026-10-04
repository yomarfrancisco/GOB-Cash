import { create } from 'zustand'

type DeskFocusState = {
  focusAt: number | null
  focusCycle: number | null
  setFocus: (focusAt: number | null, focusCycle?: number | null) => void
}

export const useDeskFocusStore = create<DeskFocusState>((set) => ({
  focusAt: null,
  focusCycle: null,
  setFocus: (focusAt, focusCycle = null) => set({ focusAt, focusCycle }),
}))

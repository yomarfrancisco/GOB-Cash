/**
 * Desk sheet chrome: Desk vs Earn. Calculator is an action, not a sheet mode.
 */
import { create } from 'zustand'

export type DeskChromeMode = 'desk' | 'earn'

type DeskChromeState = {
  mode: DeskChromeMode
  setMode: (mode: DeskChromeMode) => void
  resetToDesk: () => void
}

export const useDeskChromeStore = create<DeskChromeState>((set) => ({
  mode: 'desk',
  setMode: (mode) => set({ mode }),
  resetToDesk: () => set({ mode: 'desk' }),
}))

import { create } from 'zustand'

export type LinkedAccountsOrigin = 'settings' | 'depositCard' | 'other'

interface LinkedAccountsSheetState {
  isOpen: boolean
  origin: LinkedAccountsOrigin
  open: (origin?: LinkedAccountsOrigin) => void
  close: () => void
  setOrigin: (origin: LinkedAccountsOrigin) => void
}

export const useLinkedAccountsSheet = create<LinkedAccountsSheetState>((set) => ({
  isOpen: false,
  origin: 'settings', // Default to 'settings' for existing entry points
  open: (origin = 'settings') => set({ isOpen: true, origin }),
  close: () => set({ isOpen: false }), // Don't reset origin - it needs to persist for routing
  setOrigin: (origin) => set({ origin }),
}))


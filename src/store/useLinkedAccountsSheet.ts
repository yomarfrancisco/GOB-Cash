import { create } from 'zustand'

interface LinkedAccountsSheetState {
  isOpen: boolean
  open: () => void
  close: () => void
}

export const useLinkedAccountsSheet = create<LinkedAccountsSheetState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}))


import { create } from 'zustand'

interface SupportSheetState {
  isOpen: boolean
  open: () => void
  close: () => void
}

export const useSupportSheet = create<SupportSheetState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}))


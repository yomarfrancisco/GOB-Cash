import { create } from 'zustand'

interface FullNameEditSheetState {
  isOpen: boolean
  open: () => void
  close: () => void
}

export const useFullNameEditSheet = create<FullNameEditSheetState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}))


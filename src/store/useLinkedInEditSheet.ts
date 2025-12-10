import { create } from 'zustand'

interface LinkedInEditSheetState {
  isOpen: boolean
  open: () => void
  close: () => void
}

export const useLinkedInEditSheet = create<LinkedInEditSheetState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}))


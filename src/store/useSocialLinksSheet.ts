import { create } from 'zustand'

interface SocialLinksSheetState {
  isOpen: boolean
  open: () => void
  close: () => void
}

export const useSocialLinksSheet = create<SocialLinksSheetState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}))


import { create } from 'zustand'

interface AvatarEditSheetState {
  isOpen: boolean
  open: () => void
  close: () => void
}

export const useAvatarEditSheet = create<AvatarEditSheetState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}))


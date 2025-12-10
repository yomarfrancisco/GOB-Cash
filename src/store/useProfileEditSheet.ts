import { create } from 'zustand'

interface ProfileEditSheetState {
  isOpen: boolean
  open: () => void
  close: () => void
}

export const useProfileEditSheet = create<ProfileEditSheetState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}))


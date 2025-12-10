import { create } from 'zustand'

interface UsernameEditSheetState {
  isOpen: boolean
  open: () => void
  close: () => void
}

export const useUsernameEditSheet = create<UsernameEditSheetState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}))


import { create } from 'zustand'

interface NameHandleSheetState {
  isOpen: boolean
  open: () => void
  close: () => void
}

export const useNameHandleSheet = create<NameHandleSheetState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}))


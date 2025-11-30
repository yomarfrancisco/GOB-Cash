import { create } from 'zustand'

export type CardMode = 'create' | 'edit'

interface CardDetailsSheetState {
  isOpen: boolean
  mode: CardMode
  open: (mode?: CardMode) => void
  close: () => void
}

export const useCardDetailsSheet = create<CardDetailsSheetState>((set) => ({
  isOpen: false,
  mode: 'create',
  open: (mode = 'create') => set({ isOpen: true, mode }),
  close: () => set({ isOpen: false }),
}))


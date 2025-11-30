import { create } from 'zustand'

export type CardMode = 'create' | 'edit'

interface CardDetailsSheetState {
  isOpen: boolean
  mode: CardMode
  editingCardId: string | null
  open: (mode?: CardMode, cardId?: string | null) => void
  close: () => void
}

export const useCardDetailsSheet = create<CardDetailsSheetState>((set) => ({
  isOpen: false,
  mode: 'create',
  editingCardId: null,
  open: (mode = 'create', cardId = null) => set({ isOpen: true, mode, editingCardId: cardId }),
  close: () => set({ isOpen: false, editingCardId: null }),
}))


import { create } from 'zustand'
import type { LinkedAccountsOrigin } from './useLinkedAccountsSheet'

export type CardMode = 'create' | 'edit'

interface CardDetailsSheetState {
  isOpen: boolean
  mode: CardMode
  editingCardId: string | null
  origin: LinkedAccountsOrigin
  open: (mode?: CardMode, cardId?: string | null, origin?: LinkedAccountsOrigin) => void
  close: () => void
  setOrigin: (origin: LinkedAccountsOrigin) => void
}

export const useCardDetailsSheet = create<CardDetailsSheetState>((set) => ({
  isOpen: false,
  mode: 'create',
  editingCardId: null,
  origin: 'settings',
  open: (mode = 'create', cardId = null, origin = 'settings') => set({ isOpen: true, mode, editingCardId: cardId, origin }),
  close: () => set({ isOpen: false, editingCardId: null, origin: 'settings' }),
  setOrigin: (origin) => set({ origin }),
}))


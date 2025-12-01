import { create } from 'zustand'

interface CardDepositAccountSheetState {
  isOpen: boolean
  amountZAR: number | null
  open: (amountZAR: number) => void
  close: () => void
}

export const useCardDepositAccountSheet = create<CardDepositAccountSheetState>((set) => ({
  isOpen: false,
  amountZAR: null,
  open: (amountZAR) => set({ isOpen: true, amountZAR }),
  close: () => set({ isOpen: false, amountZAR: null }),
}))


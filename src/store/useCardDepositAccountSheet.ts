import { create } from 'zustand'

interface CardDepositAccountSheetState {
  isOpen: boolean
  amountZAR: number | null
  open: (amountZAR: number) => void
  close: () => void
  setAmount: (amountZAR: number) => void // Store amount without opening sheet
}

export const useCardDepositAccountSheet = create<CardDepositAccountSheetState>((set) => ({
  isOpen: false,
  amountZAR: null,
  open: (amountZAR) => set({ isOpen: true, amountZAR }),
  close: () => set({ isOpen: false, amountZAR: null }),
  setAmount: (amountZAR) => set({ amountZAR }), // Store amount without opening
}))


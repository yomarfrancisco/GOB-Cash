import { create } from 'zustand'

export type DepositAccountSource = 'card' | 'bank'

interface CardDepositAccountSheetState {
  isOpen: boolean
  amountZAR: number | null
  source: DepositAccountSource
  open: (amountZAR?: number, source?: DepositAccountSource) => void
  close: () => void
  setAmount: (amountZAR: number) => void // Store amount without opening sheet
}

export const useCardDepositAccountSheet = create<CardDepositAccountSheetState>((set) => ({
  isOpen: false,
  amountZAR: null,
  source: 'card',
  open: (amountZAR, source = 'card') =>
    set({ isOpen: true, amountZAR: typeof amountZAR === 'number' ? amountZAR : null, source }),
  close: () => set({ isOpen: false, amountZAR: null, source: 'card' }),
  setAmount: (amountZAR) => set({ amountZAR }), // Store amount without opening
}))

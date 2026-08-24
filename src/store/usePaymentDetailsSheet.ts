import { create } from 'zustand'

export type PaymentDetailsMode = 'pay' | 'request'

interface PaymentDetailsSheetState {
  isOpen: boolean
  mode: PaymentDetailsMode | null
  amountMZN: number | null
  amountZAR: number | null
  open: (mode: PaymentDetailsMode, amountMZN: number, amountZAR: number) => void
  close: () => void
}

export const usePaymentDetailsSheet = create<PaymentDetailsSheetState>((set) => ({
  isOpen: false,
  mode: null,
  amountMZN: null,
  amountZAR: null,
  open: (mode, amountMZN, amountZAR) => set({ isOpen: true, mode, amountMZN, amountZAR }),
  close: () => set({ isOpen: false, mode: null, amountMZN: null, amountZAR: null }),
}))


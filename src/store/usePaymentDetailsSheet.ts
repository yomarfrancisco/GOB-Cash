import { create } from 'zustand'

export type PaymentDetailsMode = 'pay' | 'request'

interface PaymentDetailsSheetState {
  isOpen: boolean
  mode: PaymentDetailsMode | null
  amountZAR: number | null
  open: (mode: PaymentDetailsMode, amountZAR: number) => void
  close: () => void
}

export const usePaymentDetailsSheet = create<PaymentDetailsSheetState>((set) => ({
  isOpen: false,
  mode: null,
  amountZAR: null,
  open: (mode, amountZAR) => set({ isOpen: true, mode, amountZAR }),
  close: () => set({ isOpen: false, mode: null, amountZAR: null }),
}))


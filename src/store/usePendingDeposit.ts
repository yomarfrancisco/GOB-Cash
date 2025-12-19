import { create } from 'zustand'

interface PendingDepositState {
  amountZAR: number | null
  method: 'card' | 'bank' | null
  setAmount: (amountZAR: number) => void
  setMethod: (method: 'card' | 'bank' | null) => void
  clear: () => void
}

export const usePendingDeposit = create<PendingDepositState>((set) => ({
  amountZAR: null,
  method: null,
  setAmount: (amountZAR) => set({ amountZAR }),
  setMethod: (method) => set({ method }),
  clear: () => set({ amountZAR: null, method: null }),
}))


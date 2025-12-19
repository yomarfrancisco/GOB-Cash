import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface PendingDepositState {
  direction: 'deposit' | 'withdraw' | null
  amountZAR: number | null
  method: 'card' | 'bank' | null
  source: 'keypad' | null
  setPendingDeposit: (data: {
    direction?: 'deposit' | 'withdraw' | null
    amountZAR?: number | null
    method?: 'card' | 'bank' | null
    source?: 'keypad' | null
  }) => void
  setAmount: (amountZAR: number) => void // Legacy support
  setMethod: (method: 'card' | 'bank' | null) => void // Legacy support
  clear: () => void
}

export const usePendingDeposit = create<PendingDepositState>()(
  persist(
    (set) => ({
      direction: null,
      amountZAR: null,
      method: null,
      source: null,
      setPendingDeposit: (data) =>
        set((state) => ({
          ...state,
          ...data,
        })),
      setAmount: (amountZAR) => set({ amountZAR }), // Legacy support
      setMethod: (method) => set({ method }), // Legacy support
      clear: () => set({ direction: null, amountZAR: null, method: null, source: null }),
    }),
    {
      name: 'gob-pending-deposit',
    }
  )
)


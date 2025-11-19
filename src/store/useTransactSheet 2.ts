import { create } from 'zustand'

type TransactAction = 'deposit' | 'withdraw' | 'payment' | 'transfer'
type TransactIntent = TransactAction | null
type OnSelectHandler = (action: TransactAction) => void

interface TransactState {
  isOpen: boolean
  intent: TransactIntent
  onSelect: OnSelectHandler | null
  open: (intent?: TransactIntent) => void
  close: () => void
  setOnSelect: (handler: OnSelectHandler | null) => void
}

export const useTransactSheet = create<TransactState>((set) => ({
  isOpen: false,
  intent: null,
  onSelect: null,
  open: (intent = null) => set({ isOpen: true, intent }),
  close: () => set({ isOpen: false, intent: null }),
  setOnSelect: (handler) => set({ onSelect: handler }),
}))


import { create } from 'zustand'

export type BankingMode = 'create' | 'edit'

interface BankingDetailsSheetState {
  isOpen: boolean
  mode: BankingMode
  editingBankId: string | null
  open: (mode?: BankingMode, bankId?: string | null) => void
  close: () => void
}

export const useBankingDetailsSheet = create<BankingDetailsSheetState>((set) => ({
  isOpen: false,
  mode: 'create',
  editingBankId: null,
  open: (mode = 'create', bankId = null) => set({ isOpen: true, mode, editingBankId: bankId }),
  close: () => set({ isOpen: false, editingBankId: null }),
}))


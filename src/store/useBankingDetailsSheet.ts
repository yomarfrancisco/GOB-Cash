import { create } from 'zustand'

export type BankingMode = 'create' | 'edit' | 'withdraw'

interface BankingDetailsSheetState {
  isOpen: boolean
  mode: BankingMode
  editingBankId: string | null
  withdrawalAmountZAR: number | null // Amount for bank withdrawal (null when not in withdrawal mode)
  onWithdrawalCreated?: (txId: string) => void // Callback when withdrawal is created
  open: (mode?: BankingMode, bankId?: string | null, withdrawalAmountZAR?: number | null, onWithdrawalCreated?: (txId: string) => void) => void
  close: () => void
}

export const useBankingDetailsSheet = create<BankingDetailsSheetState>((set) => ({
  isOpen: false,
  mode: 'create',
  editingBankId: null,
  withdrawalAmountZAR: null,
  onWithdrawalCreated: undefined,
  open: (mode = 'create', bankId = null, withdrawalAmountZAR = null, onWithdrawalCreated) => 
    set({ isOpen: true, mode, editingBankId: bankId, withdrawalAmountZAR, onWithdrawalCreated }),
  close: () => set({ isOpen: false, editingBankId: null, withdrawalAmountZAR: null, onWithdrawalCreated: undefined }),
}))


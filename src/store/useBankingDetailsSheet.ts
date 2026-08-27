import { create } from 'zustand'

export type BankingMode = 'create' | 'edit' | 'withdraw'

interface BankingDetailsSheetState {
  isOpen: boolean
  mode: BankingMode
  editingBankId: string | null
  withdrawalAmountZAR: number | null // Amount for bank withdrawal (null when not in withdrawal mode)
  withdrawalAmountMZN: number | null
  onWithdrawalCreated?: (txId: string) => void
  onDismiss?: () => void
  open: (
    mode?: BankingMode,
    bankId?: string | null,
    withdrawalAmountZAR?: number | null,
    onWithdrawalCreated?: (txId: string) => void,
    withdrawalAmountMZN?: number | null,
    onDismiss?: () => void
  ) => void
  close: () => void
}

export const useBankingDetailsSheet = create<BankingDetailsSheetState>((set) => ({
  isOpen: false,
  mode: 'create',
  editingBankId: null,
  withdrawalAmountZAR: null,
  withdrawalAmountMZN: null,
  onWithdrawalCreated: undefined,
  onDismiss: undefined,
  open: (mode = 'create', bankId = null, withdrawalAmountZAR = null, onWithdrawalCreated, withdrawalAmountMZN = null, onDismiss) =>
    set({ isOpen: true, mode, editingBankId: bankId, withdrawalAmountZAR, withdrawalAmountMZN, onWithdrawalCreated, onDismiss }),
  close: () => set({
    isOpen: false,
    editingBankId: null,
    withdrawalAmountZAR: null,
    withdrawalAmountMZN: null,
    onWithdrawalCreated: undefined,
    onDismiss: undefined,
  }),
}))


import { create } from 'zustand'

export type UsdtWalletMode = 'create' | 'edit'

interface UsdtWalletAddressSheetState {
  isOpen: boolean
  mode: UsdtWalletMode
  editingWalletId: string | null
  open: (mode?: UsdtWalletMode, walletId?: string | null) => void
  close: () => void
}

export const useUsdtWalletAddressSheet = create<UsdtWalletAddressSheetState>((set) => ({
  isOpen: false,
  mode: 'create',
  editingWalletId: null,
  open: (mode = 'create', walletId = null) => set({ isOpen: true, mode, editingWalletId: walletId }),
  close: () => set({ isOpen: false, editingWalletId: null }),
}))


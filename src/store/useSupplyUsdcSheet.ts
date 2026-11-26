import { create } from 'zustand'

type SupplyUsdcSheetState = {
  open: boolean
  solanaPayUrl: string | null
  reference: string | null
  supplyId: string | null
  openWith: (params: { solanaPayUrl: string; reference: string; supplyId: string }) => void
  close: () => void
}

export const useSupplyUsdcSheet = create<SupplyUsdcSheetState>((set) => ({
  open: false,
  solanaPayUrl: null,
  reference: null,
  supplyId: null,
  openWith: ({ solanaPayUrl, reference, supplyId }) =>
    set({ open: true, solanaPayUrl, reference, supplyId }),
  close: () => set({ open: false, solanaPayUrl: null, reference: null, supplyId: null }),
}))

import { create } from 'zustand'

interface PayoutAccountSheetState {
  isOpen: boolean
  zarAmount: number
  activityEventId: string | null
  open: (opts: { zarAmount: number; activityEventId?: string | null }) => void
  close: () => void
}

export const usePayoutAccountSheet = create<PayoutAccountSheetState>((set) => ({
  isOpen: false,
  zarAmount: 0,
  activityEventId: null,
  open: ({ zarAmount, activityEventId = null }) =>
    set({ isOpen: true, zarAmount: Math.max(0, zarAmount), activityEventId }),
  close: () => set({ isOpen: false, activityEventId: null }),
}))

/**
 * Shared Cash Flow State Store
 * Manages the cash deposit flow state machine that can be accessed by both
 * CashMapPopup and DirectMessage components
 */

import { create } from 'zustand'

export type CashFlowState =
  | 'IDLE'
  | 'MATCHED_EN_ROUTE'
  | 'ARRIVED'
  | 'IN_TRANSIT_TO_HQ'
  | 'WITHDRAWAL_CONFIRMED'
  | 'COMPLETED'
  | 'EXPIRED'

type CashFlowStateStore = {
  cashFlowState: CashFlowState
  setCashFlowState: (state: CashFlowState) => void
  confirmCashDeposit: () => void // Helper to transition from ARRIVED to IN_TRANSIT_TO_HQ
  confirmCashWithdrawal: () => void // Helper to transition from ARRIVED to WITHDRAWAL_CONFIRMED
  isMapOpen: boolean
  openMap: () => void
  closeMap: () => void
  convertAmount: number
  setConvertAmount: (amount: number) => void
}

export const useCashFlowStateStore = create<CashFlowStateStore>((set) => ({
  cashFlowState: 'IDLE',
  setCashFlowState: (state) => set({ cashFlowState: state }),
  confirmCashDeposit: () => set({ cashFlowState: 'IN_TRANSIT_TO_HQ' }),
  confirmCashWithdrawal: () => set({ cashFlowState: 'WITHDRAWAL_CONFIRMED' }),
  isMapOpen: false,
  openMap: () => set({ isMapOpen: true }),
  closeMap: () => set({ isMapOpen: false }),
  convertAmount: 0,
  setConvertAmount: (amount) => set({ convertAmount: amount }),
}))


import { create } from 'zustand'

export type ConversionDestination = 'ZAR' | 'MZN'

interface PayIntoSheetState {
  isOpen: boolean
  destination: ConversionDestination
  open: () => void
  close: () => void
  setDestination: (destination: ConversionDestination) => void
}

export const usePayIntoSheet = create<PayIntoSheetState>((set) => ({
  isOpen: false,
  destination: 'ZAR',
  open: () => set({ isOpen: true, destination: 'ZAR' }),
  close: () => set({ isOpen: false }),
  setDestination: (destination) => set({ destination }),
}))

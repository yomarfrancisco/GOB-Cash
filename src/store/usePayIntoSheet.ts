import { create } from 'zustand'

export type ConversionDestination = 'ZAR' | 'MZN'

interface PayIntoSheetState {
  isOpen: boolean
  destination: ConversionDestination
  open: (destination?: ConversionDestination) => void
  close: () => void
  setDestination: (destination: ConversionDestination) => void
}

export const usePayIntoSheet = create<PayIntoSheetState>((set) => ({
  isOpen: false,
  destination: 'ZAR',
  open: (destination: ConversionDestination = 'ZAR') => set({ isOpen: true, destination }),
  close: () => set({ isOpen: false }),
  setDestination: (destination) => set({ destination }),
}))

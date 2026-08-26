import { create } from 'zustand'

export type ConversionDestination = 'ZAR' | 'MZN'

/** Home stack: SA card on top spends Rand; Moz (and anything else) spends Metical. */
export function conversionDestinationFromTopCard(cardType: string): ConversionDestination {
  return cardType === 'savings' ? 'MZN' : 'ZAR'
}

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

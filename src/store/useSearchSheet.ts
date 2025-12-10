/**
 * Search Sheet Store
 * Manages the search modal sheet state
 */

import { create } from 'zustand'

type SearchSheetState = {
  isOpen: boolean
  open: () => void
  close: () => void
}

export const useSearchSheet = create<SearchSheetState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}))


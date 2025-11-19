'use client'

import { create } from 'zustand'

interface ShareProfileSheetState {
  isOpen: boolean
  open: () => void
  close: () => void
}

export const useShareProfileSheet = create<ShareProfileSheetState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}))


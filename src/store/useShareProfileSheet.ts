'use client'

import { create } from 'zustand'

interface ShareProfileSheetState {
  isOpen: boolean
  handle: string | null
  isOwnProfile: boolean
  open: (options?: { handle?: string; isOwnProfile?: boolean }) => void
  close: () => void
}

export const useShareProfileSheet = create<ShareProfileSheetState>((set) => ({
  isOpen: false,
  handle: null,
  isOwnProfile: true,
  open: (options) => set({ 
    isOpen: true, 
    handle: options?.handle || null,
    isOwnProfile: options?.isOwnProfile ?? true 
  }),
  close: () => set({ isOpen: false, handle: null, isOwnProfile: true }),
}))


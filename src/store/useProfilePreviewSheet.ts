/**
 * Profile Preview Sheet Store
 * Manages the profile preview modal sheet state
 */

import { create } from 'zustand'

type ProfilePreviewSheetState = {
  open: boolean
  handle: string | null
  openSheet: (handle: string) => void
  closeSheet: () => void
}

export const useProfilePreviewSheet = create<ProfilePreviewSheetState>((set) => ({
  open: false,
  handle: null,
  openSheet: (handle) => set({ open: true, handle }),
  closeSheet: () => set({ open: false, handle: null }),
}))


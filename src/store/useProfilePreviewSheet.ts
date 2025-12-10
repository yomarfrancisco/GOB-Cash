/**
 * Profile Preview Sheet Store
 * Manages the profile preview modal sheet state
 */

import { create } from 'zustand'

type ProfilePreviewSheetState = {
  open: boolean
  handle: string | null
  fromSearch: boolean
  openSheet: (handle: string, fromSearch?: boolean) => void
  closeSheet: () => void
}

export const useProfilePreviewSheet = create<ProfilePreviewSheetState>((set) => ({
  open: false,
  handle: null,
  fromSearch: false,
  openSheet: (handle, fromSearch = false) => set({ open: true, handle, fromSearch }),
  closeSheet: () => set({ open: false, handle: null, fromSearch: false }),
}))


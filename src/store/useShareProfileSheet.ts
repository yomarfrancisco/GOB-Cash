'use client'

import { create } from 'zustand'

export type ShareProfileSubject = {
  handle: string
  avatarUrl?: string | null
  fullName?: string | null
}

interface ShareProfileSheetState {
  isOpen: boolean
  subject: ShareProfileSubject | null
  mode: 'self' | 'other'
  open: (options: { subject: ShareProfileSubject; mode?: 'self' | 'other' }) => void
  close: () => void
}

export const useShareProfileSheet = create<ShareProfileSheetState>((set) => ({
  isOpen: false,
  subject: null,
  mode: 'self',
  open: (options) => set({ 
    isOpen: true, 
    subject: options.subject,
    mode: options.mode || 'self'
  }),
  close: () => set({ isOpen: false, subject: null, mode: 'self' }),
}))


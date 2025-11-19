/**
 * BabyCDO Chat State
 * Manages the custom in-app chat with BabyCDO (AI portfolio manager)
 */

import { create } from 'zustand'
import { nanoid } from 'nanoid'

export type BabyCdoMessage = {
  id: string
  role: 'assistant' | 'user'
  text: string
  createdAt: number
}

type BabyCdoChatState = {
  open: boolean
  messages: BabyCdoMessage[]
  autoCloseDelayMs: number | null
  openWithIntro: (introText: string, autoCloseDelayMs?: number | null) => void
  openChat: () => void
  close: () => void
  addUserMessage: (text: string) => void
  addAssistantMessage: (text: string) => void
  clear: () => void
}

export const useBabyCdoChatStore = create<BabyCdoChatState>((set, get) => ({
  open: false,
  messages: [],
  autoCloseDelayMs: null,

  openWithIntro: (introText, autoCloseDelayMs = null) => {
    set({
      open: true,
      autoCloseDelayMs,
      messages: [
        {
          id: nanoid(),
          role: 'assistant',
          text: introText,
          createdAt: Date.now(),
        },
      ],
    })
  },

  openChat: () => set({ open: true }),

  close: () => set({ open: false, autoCloseDelayMs: null }),

  addUserMessage: (text) =>
    set((state) => ({
      messages: [
        ...state.messages,
        { id: nanoid(), role: 'user', text, createdAt: Date.now() },
      ],
    })),

  addAssistantMessage: (text) =>
    set((state) => ({
      messages: [
        ...state.messages,
        { id: nanoid(), role: 'assistant', text, createdAt: Date.now() },
      ],
    })),

  clear: () => set({ messages: [], autoCloseDelayMs: null }),
}))


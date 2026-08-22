import { create } from 'zustand'
import {
  exitWhatsAppClaimToHome,
  guestHandleFromNonce,
  type WhatsAppClaimBank,
} from '@/lib/whatsappClaim'

type ClaimPhase = 'idle' | 'banking' | 'ama'

type WhatsAppClaimState = {
  isActive: boolean
  phase: ClaimPhase
  amountZAR: number | null
  token: string | null
  guestHandle: string | null
  bank: WhatsAppClaimBank | null
  start: (input: { amountZAR: number; token: string; nonce: string }) => void
  submitBanking: (bank: WhatsAppClaimBank) => void
  exitToHome: () => void
}

export const useWhatsAppClaimStore = create<WhatsAppClaimState>((set, get) => ({
  isActive: false,
  phase: 'idle',
  amountZAR: null,
  token: null,
  guestHandle: null,
  bank: null,
  start: ({ amountZAR, token, nonce }) => {
    if (get().token === token && get().isActive) return
    set({
      isActive: true,
      phase: 'banking',
      amountZAR,
      token,
      guestHandle: guestHandleFromNonce(nonce),
      bank: null,
    })
  },
  submitBanking: (bank) => {
    if (!get().isActive) return
    set({ bank, phase: 'ama' })
  },
  exitToHome: () => {
    set({
      isActive: false,
      phase: 'idle',
      amountZAR: null,
      token: null,
      guestHandle: null,
      bank: null,
    })
    exitWhatsAppClaimToHome()
  },
}))

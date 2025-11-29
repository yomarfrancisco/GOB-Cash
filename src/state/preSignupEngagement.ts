/**
 * Pre-signup Engagement Store
 * 
 * Manages the coordination between auth flow and chat auto-popup on the landing page.
 * Ensures that the Ama chat auto-popup does not interfere with the auth sign-in/sign-up flow.
 */

import { create } from 'zustand'

type PreSignupEngagementState = {
  isAuthFlowActive: boolean
  chatAutoTimeoutId: number | null
  setAuthFlowActive: (active: boolean) => void
  setChatAutoTimeoutId: (id: number | null) => void
}

export const usePreSignupEngagementStore = create<PreSignupEngagementState>((set) => ({
  isAuthFlowActive: false,
  chatAutoTimeoutId: null,
  setAuthFlowActive: (active) => set({ isAuthFlowActive: active }),
  setChatAutoTimeoutId: (id) => set({ chatAutoTimeoutId: id }),
}))


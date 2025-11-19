import { create } from 'zustand'

interface AuthState {
  isSignedIn: boolean
  isSignInOpen: boolean
  openSignIn: () => void
  closeSignIn: () => void
  completeFakeSignIn: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  isSignedIn: false,
  isSignInOpen: false,
  openSignIn: () => set({ isSignInOpen: true }),
  closeSignIn: () => set({ isSignInOpen: false }),
  completeFakeSignIn: () => set({ isSignedIn: true, isSignInOpen: false }),
}))


import { create } from 'zustand'

type AuthView = 'provider-list' | 'whatsapp-signin' | 'whatsapp-signup'

interface AuthState {
  isAuthed: boolean
  authOpen: boolean
  authView: AuthView
  openAuth: () => void
  closeAuth: () => void
  setAuthView: (view: AuthView) => void
  completeAuth: () => void
  requireAuth: (onAuthed: () => void) => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthed: false,
  authOpen: false,
  authView: 'provider-list',
  openAuth: () => set({ authOpen: true, authView: 'provider-list' }),
  closeAuth: () => set({ authOpen: false }),
  setAuthView: (view) => set({ authView: view }),
  completeAuth: () => set({ isAuthed: true, authOpen: false }),
  requireAuth: (onAuthed) => {
    const { isAuthed, openAuth } = get()
    if (!isAuthed) {
      openAuth()
    } else {
      onAuthed()
    }
  },
}))


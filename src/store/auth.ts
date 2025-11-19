import { create } from 'zustand'

type AuthMode = 'signin' | 'signup'

interface AuthState {
  isAuthed: boolean
  authOpen: boolean
  authMode: AuthMode
  openAuth: (mode?: AuthMode) => void
  closeAuth: () => void
  setAuthMode: (mode: AuthMode) => void
  completeAuth: () => void
  requireAuth: (onAuthed: () => void) => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthed: false,
  authOpen: false,
  authMode: 'signin',
  openAuth: (mode = 'signin') => set({ authOpen: true, authMode: mode }),
  closeAuth: () => set({ authOpen: false }),
  setAuthMode: (mode) => set({ authMode: mode }),
  completeAuth: () => set({ isAuthed: true, authOpen: false }),
  requireAuth: (onAuthed) => {
    const { isAuthed, openAuth } = get()
    if (!isAuthed) {
      openAuth('signin')
    } else {
      onAuthed()
    }
  },
}))


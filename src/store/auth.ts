import { create } from 'zustand'

type AuthView = 'provider-list' | 'whatsapp-signin' | 'whatsapp-signup'

interface AuthState {
  isAuthed: boolean
  authOpen: boolean // Legacy - now controls entry sheet
  authEntryOpen: boolean // New entry sheet (sign-in method selection)
  authPasswordOpen: boolean // Password sheet (existing password modal)
  phoneSignupOpen: boolean // Phone sign-up sheet
  authView: AuthView
  authIdentifier: string | null // Username or phone number from entry sheet
  openAuth: () => void // Opens entry sheet
  closeAuth: () => void // Closes entry sheet
  closeAllAuth: () => void // Closes all auth sheets and returns to home
  openAuthEntry: () => void
  openAuthEntrySignup: () => void // Open entry sheet in signup mode
  closeAuthEntry: () => void
  openAuthPassword: () => void
  closeAuthPassword: () => void
  openPhoneSignup: () => void
  closePhoneSignup: () => void
  setAuthIdentifier: (identifier: string) => void
  setAuthView: (view: AuthView) => void
  completeAuth: () => void
  requireAuth: (onAuthed: () => void) => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthed: false,
  authOpen: false, // Legacy - kept for backward compatibility, now maps to entry sheet
  authEntryOpen: false,
  authPasswordOpen: false,
  phoneSignupOpen: false,
  authView: 'provider-list',
  authIdentifier: null,
  openAuth: () => set({ authOpen: true, authEntryOpen: true, authView: 'provider-list' }),
  closeAuth: () => set({ authOpen: false, authEntryOpen: false }),
  closeAllAuth: () => set({ authOpen: false, authEntryOpen: false, authPasswordOpen: false, phoneSignupOpen: false }),
  openAuthEntry: () => set({ authEntryOpen: true, authOpen: true }),
  openAuthEntrySignup: () => set({ authEntryOpen: true, authOpen: true, authView: 'whatsapp-signup' }),
  closeAuthEntry: () => set({ authEntryOpen: false, authOpen: false }),
  openAuthPassword: () => set({ authPasswordOpen: true }),
  closeAuthPassword: () => set({ authPasswordOpen: false, authIdentifier: null }),
  openPhoneSignup: () => set({ phoneSignupOpen: true }),
  closePhoneSignup: () => set({ phoneSignupOpen: false }),
  setAuthIdentifier: (identifier) => set({ authIdentifier: identifier }),
  setAuthView: (view) => set({ authView: view }),
  completeAuth: () => set({ isAuthed: true, authOpen: false, authEntryOpen: false, authPasswordOpen: false, phoneSignupOpen: false }),
  requireAuth: (onAuthed) => {
    const { isAuthed, openAuthEntry } = get()
    if (!isAuthed) {
      openAuthEntry()
    } else {
      onAuthed()
    }
  },
}))


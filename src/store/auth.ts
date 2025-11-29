import { create } from 'zustand'
import { useNotificationStore } from './notifications'
import { stopDemoNotificationEngine } from '@/lib/demo/demoNotificationEngine'
import { usePreSignupEngagementStore } from '@/state/preSignupEngagement'

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
  openAuth: () => {
    const { chatAutoTimeoutId, setChatAutoTimeoutId, setAuthFlowActive } = usePreSignupEngagementStore.getState()
    // Cancel any pending chat auto-open
    if (chatAutoTimeoutId !== null) {
      clearTimeout(chatAutoTimeoutId)
      setChatAutoTimeoutId(null)
    }
    setAuthFlowActive(true)
    set({ authOpen: true, authEntryOpen: true, authView: 'provider-list' })
  },
  closeAuth: () => {
    usePreSignupEngagementStore.getState().setAuthFlowActive(false)
    set({ authOpen: false, authEntryOpen: false })
  },
  closeAllAuth: () => {
    usePreSignupEngagementStore.getState().setAuthFlowActive(false)
    set({ authOpen: false, authEntryOpen: false, authPasswordOpen: false, phoneSignupOpen: false })
  },
  openAuthEntry: () => {
    const { chatAutoTimeoutId, setChatAutoTimeoutId, setAuthFlowActive } = usePreSignupEngagementStore.getState()
    // Cancel any pending chat auto-open
    if (chatAutoTimeoutId !== null) {
      clearTimeout(chatAutoTimeoutId)
      setChatAutoTimeoutId(null)
    }
    setAuthFlowActive(true)
    set({ authEntryOpen: true, authOpen: true })
  },
  openAuthEntrySignup: () => {
    const { chatAutoTimeoutId, setChatAutoTimeoutId, setAuthFlowActive } = usePreSignupEngagementStore.getState()
    // Cancel any pending chat auto-open
    if (chatAutoTimeoutId !== null) {
      clearTimeout(chatAutoTimeoutId)
      setChatAutoTimeoutId(null)
    }
    setAuthFlowActive(true)
    set({ authEntryOpen: true, authOpen: true, authView: 'whatsapp-signup' })
  },
  closeAuthEntry: () => {
    usePreSignupEngagementStore.getState().setAuthFlowActive(false)
    set({ authEntryOpen: false, authOpen: false })
  },
  openAuthPassword: () => {
    usePreSignupEngagementStore.getState().setAuthFlowActive(true)
    set({ authPasswordOpen: true })
  },
  closeAuthPassword: () => {
    // Only set auth flow inactive if no other auth sheet is open
    const state = get()
    if (!state.authEntryOpen && !state.phoneSignupOpen) {
      usePreSignupEngagementStore.getState().setAuthFlowActive(false)
    }
    set({ authPasswordOpen: false, authIdentifier: null })
  },
  openPhoneSignup: () => {
    usePreSignupEngagementStore.getState().setAuthFlowActive(true)
    set({ phoneSignupOpen: true })
  },
  closePhoneSignup: () => {
    // Only set auth flow inactive if no other auth sheet is open
    const state = get()
    if (!state.authEntryOpen && !state.authPasswordOpen) {
      usePreSignupEngagementStore.getState().setAuthFlowActive(false)
    }
    set({ phoneSignupOpen: false })
  },
  setAuthIdentifier: (identifier) => set({ authIdentifier: identifier }),
  setAuthView: (view) => set({ authView: view }),
  completeAuth: () => {
    // Stop all demo animations and notifications
    stopDemoNotificationEngine()
    
    // Clear notification queue
    const { clearNotifications } = useNotificationStore.getState()
    clearNotifications()
    
    // Mark auth flow as inactive
    usePreSignupEngagementStore.getState().setAuthFlowActive(false)
    
    // Set authenticated state
    set({ isAuthed: true, authOpen: false, authEntryOpen: false, authPasswordOpen: false, phoneSignupOpen: false })
  },
  requireAuth: (onAuthed) => {
    const { isAuthed, openAuthEntry } = get()
    if (!isAuthed) {
      openAuthEntry()
    } else {
      onAuthed()
    }
  },
}))


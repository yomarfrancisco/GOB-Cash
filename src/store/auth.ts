import { create } from 'zustand'
import { useNotificationStore } from './notifications'
import { stopDemoNotificationEngine } from '@/lib/demo/demoNotificationEngine'
import { prefetchAuthImages } from '@/lib/prefetchAuthImages'
import { type ConfirmationResult } from 'firebase/auth'

type AuthView = 'provider-list' | 'whatsapp-signin' | 'whatsapp-signup'

interface AuthState {
  isAuthed: boolean
  authReady: boolean // True after Firebase has checked auth state (prevents redirect race during hydration)
  authOpen: boolean // Legacy - now controls entry sheet
  authEntryOpen: boolean // New entry sheet (sign-in method selection)
  authPasswordOpen: boolean // Password sheet (existing password modal)
  phoneSignupOpen: boolean // Phone sign-up sheet
  authView: AuthView
  authIdentifier: string | null // Username or phone number from entry sheet
  phoneSignupPhone: string | null // Phone number for sign-up (E.164 format)
  phoneConfirmationResult: ConfirmationResult | null // Firebase confirmation result for OTP
  phoneResolutionMetadata: {
    phoneRaw: string
    phoneE164: string
    phoneCountry: string // ISO2
    phoneCountryConfidence: number
    phoneCountryCandidates: Array<{ iso2: string; score: number; reasons: string[] }>
    signupTimezone: string | null
    signupLocale: string | null
    geoAtSignup: { lat: number; lng: number; accuracyM?: number } | null
  } | null
  openAuth: () => void // Opens entry sheet
  closeAuth: () => void // Closes entry sheet
  closeAllAuth: () => void // Closes all auth sheets and returns to home
  openAuthEntry: () => void // Opens entry sheet in signup mode (default)
  openAuthEntryLogin: () => void // Opens entry sheet in login mode
  openAuthEntrySignup: () => void // Open entry sheet in signup mode
  closeAuthEntry: () => void
  openAuthPassword: () => void
  closeAuthPassword: () => void
  openPhoneSignup: () => void
  closePhoneSignup: () => void
  setAuthIdentifier: (identifier: string) => void
  setAuthView: (view: AuthView) => void
  setAuthState: (isAuthed: boolean) => void // New: Set auth state from Firebase Auth
  setAuthReady: () => void // Mark auth as ready (after Firebase has checked state)
  completeAuth: () => void // Legacy: Kept for backward compatibility, but Firebase Auth now drives isAuthed
  requireAuth: (onAuthed: () => void) => void
  setPhoneSignupPhone: (phone: string) => void
  setPhoneConfirmationResult: (result: ConfirmationResult | null) => void
  setPhoneResolutionMetadata: (metadata: AuthState['phoneResolutionMetadata']) => void
  clearPhoneAuth: () => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthed: false,
  authReady: false, // Auth state not yet checked by Firebase
  authOpen: false, // Legacy - kept for backward compatibility, now maps to entry sheet
  authEntryOpen: false,
  authPasswordOpen: false,
  phoneSignupOpen: false,
  authView: 'provider-list',
  authIdentifier: null,
  phoneSignupPhone: null,
  phoneConfirmationResult: null,
  phoneResolutionMetadata: null,
  openAuth: () => {
    prefetchAuthImages() // Prefetch auth backgrounds before opening
    set({ authOpen: true, authEntryOpen: true, authView: 'provider-list' })
  },
  closeAuth: () => set({ authOpen: false, authEntryOpen: false }),
  closeAllAuth: () => set({ authOpen: false, authEntryOpen: false, authPasswordOpen: false, phoneSignupOpen: false }),
  openAuthEntry: () => {
    prefetchAuthImages() // Prefetch auth backgrounds before opening
    set({ authEntryOpen: true, authOpen: true, authView: 'whatsapp-signup' }) // Default to signup
  },
  openAuthEntryLogin: () => {
    prefetchAuthImages() // Prefetch auth backgrounds before opening
    set({ authEntryOpen: true, authOpen: true, authView: 'whatsapp-signin' }) // Explicitly open in login mode
  },
  openAuthEntrySignup: () => {
    prefetchAuthImages() // Prefetch auth backgrounds before opening
    set({ authEntryOpen: true, authOpen: true, authView: 'whatsapp-signup' })
  },
  closeAuthEntry: () => set({ authEntryOpen: false, authOpen: false }),
  openAuthPassword: () => set({ authPasswordOpen: true }),
  closeAuthPassword: () => set({ authPasswordOpen: false, authIdentifier: null }),
  openPhoneSignup: () => set({ phoneSignupOpen: true }),
  closePhoneSignup: () => set({ phoneSignupOpen: false }),
  setAuthIdentifier: (identifier) => set({ authIdentifier: identifier }),
  setAuthView: (view) => set({ authView: view }),
  setAuthState: (isAuthed) => {
    if (isAuthed) {
      // Stop all demo animations and notifications when authenticating
      stopDemoNotificationEngine()
      
      // Clear notification queue
      const { clearNotifications } = useNotificationStore.getState()
      clearNotifications()
      
      // Close all auth sheets
      set({ 
        isAuthed: true,
        authReady: true, // Mark auth as ready when state is set
        authOpen: false, 
        authEntryOpen: false, 
        authPasswordOpen: false, 
        phoneSignupOpen: false 
      })
    } else {
      // User signed out
      set({ isAuthed: false, authReady: true }) // Mark auth as ready even on sign-out
    }
  },
  setAuthReady: () => set({ authReady: true }),
  completeAuth: () => {
    // Legacy method - kept for backward compatibility
    // Firebase Auth now drives isAuthed via setAuthState, but this can still be called
    // to trigger the same side effects (stop demo, clear notifications, close sheets)
    stopDemoNotificationEngine()
    
    const { clearNotifications } = useNotificationStore.getState()
    clearNotifications()
    
    set({ authOpen: false, authEntryOpen: false, authPasswordOpen: false, phoneSignupOpen: false })
    // Note: isAuthed is now set by FirebaseAuthListener via setAuthState
  },
  requireAuth: (onAuthed) => {
    const { isAuthed, openAuthEntry } = get()
    if (!isAuthed) {
      prefetchAuthImages() // Prefetch auth backgrounds before opening
      openAuthEntry()
    } else {
      onAuthed()
    }
  },
  setPhoneSignupPhone: (phone) => set({ phoneSignupPhone: phone }),
  setPhoneConfirmationResult: (result) => set({ phoneConfirmationResult: result }),
  setPhoneResolutionMetadata: (metadata) => set({ phoneResolutionMetadata: metadata }),
  clearPhoneAuth: () => set({ 
    phoneSignupPhone: null, 
    phoneConfirmationResult: null,
    phoneResolutionMetadata: null,
  }),
}))


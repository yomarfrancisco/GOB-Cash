'use client'

import { create } from 'zustand'
import { useAuthStore, type AuthStateValue } from '@/store/auth'
import { useWalletStore } from '@/store/wallets'

/**
 * App Mode Store
 * 
 * Single source of truth for post-auth state and animation gates.
 * 
 * "auth-resolved" means:
 * - FirebaseAuthListener has determined auth state
 * - authState === 'authed' (or isAuthed === true && authReady === true)
 * - First Firestore wallets snapshot has been received (walletsHydrated === true)
 */
type AppModeState = {
  // Computed: Is post-auth safe mode active?
  // When true, all demo animations/simulations must stop
  isPostAuthSafeMode: () => boolean
  
  // Computed: Should post-auth animations be allowed?
  // Default false - establishes clean baseline first
  allowPostAuthAnimations: boolean
  
  // Setter for allowPostAuthAnimations (for future use)
  setAllowPostAuthAnimations: (allow: boolean) => void
}

export const useAppModeStore = create<AppModeState>((set, get) => ({
  allowPostAuthAnimations: false, // Hard default: no post-auth animations
  
  isPostAuthSafeMode: () => {
    const authState = useAuthStore.getState().getAuthState()
    const walletsHydrated = useWalletStore.getState().walletsHydrated
    
    // Post-auth safe mode = authenticated AND wallets hydrated
    const isSafe = authState === 'authed' && walletsHydrated === true
    
    return isSafe
  },
  
  setAllowPostAuthAnimations: (allow) => set({ allowPostAuthAnimations: allow }),
}))


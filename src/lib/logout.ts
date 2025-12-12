/**
 * Comprehensive logout function that:
 * 1. Signs out from Firebase
 * 2. Clears all Zustand stores
 * 3. Clears localStorage/sessionStorage
 * 4. Redirects to home
 * 
 * Safe for iOS Safari private mode (handles storage errors gracefully)
 */

'use client'

import { signOut as firebaseSignOut } from 'firebase/auth'
import { getFirebaseAuth } from './firebase'
import { useAuthStore } from '@/store/auth'
import { useUserProfileStore } from '@/store/userProfile'
import { useWalletStore } from '@/store/wallets'
import { clearContactSyncState } from './contactSyncState'

export async function logout(): Promise<void> {
  if (typeof window === 'undefined') {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[AUTH] logout called server-side, skipping')
    }
    return
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log('[AUTH] logout clicked')
  }

  try {
    // Step 1: Sign out from Firebase
    if (process.env.NODE_ENV !== 'production') {
      console.log('[AUTH] calling signOut')
    }

    const auth = getFirebaseAuth()
    await firebaseSignOut(auth)

    if (process.env.NODE_ENV !== 'production') {
      console.log('[AUTH] signOut success')
    }
  } catch (error: any) {
    // Log error but continue with cleanup (defensive: works even if signOut fails)
    console.error('[AUTH] signOut error:', {
      code: error?.code,
      message: error?.message,
    })
    // Continue with cleanup even if signOut fails
  }

  // Step 2: Clear all stores (must happen even if signOut failed)
  try {
    // Clear auth store
    const authStore = useAuthStore.getState()
    authStore.setAuthState(false)
    authStore.closeAllAuth()

    // Clear profile store
    const profileStore = useUserProfileStore.getState()
    profileStore.reset()

    // Clear wallet store
    const walletStore = useWalletStore.getState()
    walletStore.clear()

    // Clear contact sync state (if exists)
    try {
      // Get current user ID from auth if available, otherwise clear all
      const auth = getFirebaseAuth()
      const currentUser = auth.currentUser
      if (currentUser) {
        clearContactSyncState(currentUser.uid)
      }
    } catch (contactErr) {
      // Ignore contact sync errors
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[AUTH] Failed to clear contact sync state:', contactErr)
      }
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log('[AUTH] stores cleared')
    }
  } catch (storeErr) {
    console.error('[AUTH] Error clearing stores:', storeErr)
    // Continue anyway
  }

  // Step 3: Clear localStorage/sessionStorage (defensive, handles private mode)
  try {
    // Clear sessionStorage
    sessionStorage.removeItem('gob_splash_shown')
    
    // Clear any other app-specific storage keys
    const keysToRemove: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      if (key && (key.startsWith('gobankless:') || key.startsWith('gob_'))) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach(key => {
      try {
        sessionStorage.removeItem(key)
      } catch {
        // Ignore individual removal errors
      }
    })

    // Clear localStorage (if not in private mode)
    try {
      const localStorageKeys: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && (key.startsWith('gobankless:') || key.startsWith('gob_'))) {
          localStorageKeys.push(key)
        }
      }
      localStorageKeys.forEach(key => {
        try {
          localStorage.removeItem(key)
        } catch {
          // Ignore individual removal errors (private mode)
        }
      })
    } catch (localStorageErr) {
      // Private mode or storage disabled - ignore
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[AUTH] localStorage clear failed (likely private mode):', localStorageErr)
      }
    }
  } catch (storageErr) {
    // Storage completely disabled - continue anyway
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[AUTH] Storage clear failed:', storageErr)
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log('[AUTH] stores cleared, redirecting')
  }

  // Step 4: Redirect to home
  // Use window.location for hard redirect (ensures clean state)
  // This works even if router is in a bad state
  try {
    window.location.href = '/'
  } catch (redirectErr) {
    // Fallback if window.location fails
    console.error('[AUTH] Redirect failed:', redirectErr)
    // Last resort: try to reload
    try {
      window.location.reload()
    } catch {
      // If everything fails, at least we cleared the stores
    }
  }
}


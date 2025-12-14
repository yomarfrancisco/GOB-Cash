'use client'

import { signInWithPopup, signInWithRedirect, signOut as firebaseSignOut, GoogleAuthProvider } from 'firebase/auth'
import { getFirebaseAuth, getGoogleAuthProvider } from '@/lib/firebase'
import { useAuthStore } from '@/store/auth'
import { useNotificationStore } from '@/store/notifications'

/**
 * Hook for Firebase Auth with Google provider
 * 
 * This is the single source of truth for authentication.
 * Firebase Auth state drives isAuthed in Zustand via FirebaseAuthListener.
 */
export function useFirebaseAuth() {
  const { closeAllAuth } = useAuthStore()
  const { pushNotification } = useNotificationStore()

  const signInWithGoogle = async () => {
    if (typeof window === 'undefined') {
      console.warn('[FirebaseAuth] signInWithGoogle called server-side, skipping')
      return
    }

    try {
      const auth = getFirebaseAuth()
      const googleProvider = getGoogleAuthProvider()

      console.log('[FirebaseAuth] Starting Google sign-in (popup)...')

      try {
        // Try popup first (preferred UX)
        const result = await signInWithPopup(auth, googleProvider)
        console.log('[FirebaseAuth] Google sign-in success (popup)')

        // Capture Google OAuth access token for contact sync
        // The credential contains the access token we need for People API
        const credential = GoogleAuthProvider.credentialFromResult(result)
        if (credential?.accessToken) {
          // Store access token in sessionStorage for contact sync
          sessionStorage.setItem('google_access_token', credential.accessToken)
          console.log('[FirebaseAuth] Stored Google access token for contact sync')
        }

        // Close auth sheets - FirebaseAuthListener will update isAuthed
        closeAllAuth()

        // Show success notification
        pushNotification({
          kind: 'payment_received',
          title: 'Signed in with Google',
          body: 'Welcome!',
          actor: { type: 'system' },
        })
      } catch (popupErr: any) {
        // If popup is blocked, fall back to redirect
        if (popupErr?.code === 'auth/popup-blocked') {
          console.warn('[FirebaseAuth] Popup blocked, falling back to redirect')
          await signInWithRedirect(auth, googleProvider)
          // Note: After redirect, getRedirectResult in FirebaseAuthListener will handle the result
          // User will be redirected, then come back, and FirebaseAuthListener will update isAuthed
        } else {
          throw popupErr
        }
      }
    } catch (error) {
      console.error('[FirebaseAuth] Google sign-in failed:', error)
      
      // Show error notification
      pushNotification({
        kind: 'payment_failed',
        title: 'Google sign-in failed',
        body: error instanceof Error ? error.message : 'Please try again',
        actor: { type: 'system' },
      })
    }
  }

  const signOut = async () => {
    if (typeof window === 'undefined') {
      console.warn('[FirebaseAuth] signOut called server-side, skipping')
      return
    }

    try {
      const auth = getFirebaseAuth()
      await firebaseSignOut(auth)
      console.log('[FirebaseAuth] Sign-out success')
      
      // FirebaseAuthListener will automatically update isAuthed to false
    } catch (error) {
      console.error('[FirebaseAuth] Sign-out failed:', error)
    }
  }

  return { signInWithGoogle, signOut }
}


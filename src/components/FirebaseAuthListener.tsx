'use client'

import { useEffect, useRef } from 'react'
import { getRedirectResult, onAuthStateChanged } from 'firebase/auth'
import { getFirebaseAuth } from '@/lib/firebase'
import { ensureUserDocument } from '@/lib/userDoc'
import { useAuthStore } from '@/store/auth'
import { useUserProfileStore } from '@/store/userProfile'
import { generateHandleFromEmail } from '@/lib/profile/generateHandle'

/**
 * Client component that sets up Firebase Auth state listener
 * to drive isAuthed state and automatically ensure user documents exist on sign-in.
 * 
 * This is the single source of truth for authentication state.
 * 
 * Also handles redirect results from signInWithRedirect fallback.
 * 
 * This component should be mounted once in the app (e.g., in layout).
 */
export default function FirebaseAuthListener() {
  const checkedRedirectRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const auth = getFirebaseAuth()
    const { setAuthState } = useAuthStore.getState()

    // Check for redirect result on mount (one-time check)
    if (!checkedRedirectRef.current) {
      checkedRedirectRef.current = true

      getRedirectResult(auth)
        .then(async (result) => {
          if (result && result.user) {
            console.log('[Firebase] Auth redirect result user:', result.user.uid)
            await ensureUserDocument(result.user)
            // setAuthState will be called by onAuthStateChanged below
          }
        })
        .catch((err) => {
          console.warn('[Firebase] getRedirectResult error', err)
        })
    }

    // Set up auth state listener - this is the single source of truth for isAuthed
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      console.log('[Firebase] Auth state changed:', user ? `user ${user.uid}` : 'no user')
      
      // Update app's isAuthed state based on Firebase Auth
      setAuthState(!!user)
      
      // Sync profile store from Firebase user data
      if (user) {
        const { setProfile, profile } = useUserProfileStore.getState()
        
        // Generate handle from email if needed
        const generatedHandle = user.email
          ? generateHandleFromEmail(user.email)
          : profile.userHandle || '@user'
        
        // Update profile store with Firebase user data
        setProfile({
          fullName: user.displayName || profile.fullName,
          email: user.email || profile.email,
          avatarUrl: user.photoURL || profile.avatarUrl,
          // Only update handle if it's the default or doesn't exist
          userHandle:
            !profile.userHandle || profile.userHandle === '@samakoyo'
              ? generatedHandle
              : profile.userHandle,
        })
        
        // Ensure user document exists
        try {
          await ensureUserDocument(user)
          console.log('[Firebase] ensured user doc', user.uid)
        } catch (error) {
          console.error('[Firebase] Failed to ensure user document on auth state change:', error)
        }
      } else {
        // User signed out - reset profile to default (optional, or keep last profile)
        // For now, we'll keep the profile data even after sign-out
      }
    })

    // Cleanup on unmount
    return () => {
      unsubscribe()
    }
  }, [])

  // This component doesn't render anything
  return null
}


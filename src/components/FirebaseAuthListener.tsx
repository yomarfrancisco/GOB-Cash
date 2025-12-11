'use client'

import { useEffect, useRef } from 'react'
import { getRedirectResult } from 'firebase/auth'
import { getFirebaseAuth } from '@/lib/firebase'
import { setupAuthStateListener, ensureUserDocument } from '@/lib/userDoc'

/**
 * Client component that sets up Firebase Auth state listener
 * to automatically ensure user documents exist on sign-in.
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

    // Check for redirect result on mount (one-time check)
    if (!checkedRedirectRef.current) {
      checkedRedirectRef.current = true

      getRedirectResult(auth)
        .then(async (result) => {
          if (result && result.user) {
            console.log('[Firebase] Auth redirect result user:', result.user.uid)
            await ensureUserDocument(result.user)
          }
        })
        .catch((err) => {
          console.warn('[Firebase] getRedirectResult error', err)
        })
    }

    // Set up auth state listener to ensure user documents on sign-in
    const unsubscribe = setupAuthStateListener()

    // Cleanup on unmount
    return () => {
      unsubscribe()
    }
  }, [])

  // This component doesn't render anything
  return null
}


'use client'

import { useEffect } from 'react'
import { setupAuthStateListener } from '@/lib/userDoc'

/**
 * Client component that sets up Firebase Auth state listener
 * to automatically ensure user documents exist on sign-in.
 * 
 * This component should be mounted once in the app (e.g., in layout).
 */
export default function FirebaseAuthListener() {
  useEffect(() => {
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


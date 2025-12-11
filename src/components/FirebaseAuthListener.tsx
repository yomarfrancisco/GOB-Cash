'use client'

import { useEffect, useRef } from 'react'
import { getRedirectResult, onAuthStateChanged } from 'firebase/auth'
import { getFirebaseAuth } from '@/lib/firebase'
import { ensureUserDocument, subscribeToCurrentUserDoc } from '@/lib/userDoc'
import { useAuthStore } from '@/store/auth'
import { useUserProfileStore } from '@/store/userProfile'
import { generateHandleFromEmail } from '@/lib/profile/generateHandle'
import type { WalletBalances } from '@/lib/walletBalances'
import { ensureDefaultWallets, subscribeToWallets } from '@/lib/wallets'
import { useWalletStore } from '@/store/wallets'

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
  const unsubscribeDocRef = useRef<(() => void) | null>(null)
  const unsubscribeWalletsRef = useRef<(() => void) | null>(null)

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
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      console.log('[Firebase] Auth state changed:', user ? `user ${user.uid}` : 'no user')
      
      // Update app's isAuthed state based on Firebase Auth
      setAuthState(!!user)
      // Clean up previous doc subscription
      if (unsubscribeDocRef.current) {
        unsubscribeDocRef.current()
        unsubscribeDocRef.current = null
      }
      if (unsubscribeWalletsRef.current) {
        unsubscribeWalletsRef.current()
        unsubscribeWalletsRef.current = null
      }
      
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

        // Subscribe to Firestore user doc snapshots
        unsubscribeDocRef.current = subscribeToCurrentUserDoc((payload) => {
          if (!payload || !payload.data) return
          const { data } = payload
          const { setProfile, profile } = useUserProfileStore.getState()

          const balances = data.balances as WalletBalances | undefined

          setProfile({
            fullName: data.fullName || profile.fullName,
            email: data.email || profile.email,
            avatarUrl: data.avatarUrl || profile.avatarUrl,
            userHandle: data.handle || profile.userHandle,
            balances: balances || profile.balances,
          })

        })

        // Ensure wallets and subscribe to wallet snapshots
        try {
          await ensureDefaultWallets(user)
          const walletStore = useWalletStore.getState()
          unsubscribeWalletsRef.current = subscribeToWallets(user.uid, (wallets) => {
            walletStore.setWallets(wallets)
            if (process.env.NODE_ENV !== 'production') {
              console.log('[Wallets] Loaded wallets for user', user.uid, Object.keys(wallets))
            }
          })
        } catch (walletErr) {
          console.error('[Firebase] Failed to ensure/subscribe wallets', walletErr)
        }
      } else {
        // User signed out - reset profile to default (optional, or keep last profile)
        // For now, we'll keep the profile data even after sign-out
        useWalletStore.getState().clear()
      }
    })

    // Cleanup on unmount
    return () => {
      if (unsubscribeDocRef.current) {
        unsubscribeDocRef.current()
        unsubscribeDocRef.current = null
      }
      if (unsubscribeWalletsRef.current) {
        unsubscribeWalletsRef.current()
        unsubscribeWalletsRef.current = null
      }
      unsubscribeAuth()
    }
  }, [])

  // This component doesn't render anything
  return null
}


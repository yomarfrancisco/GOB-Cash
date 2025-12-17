'use client'

import { useEffect, useRef } from 'react'
import { getRedirectResult, onAuthStateChanged } from 'firebase/auth'
import { getFirebaseAuth, getFirebaseApp } from '@/lib/firebase'
import { ensureUserDocument, subscribeToCurrentUserDoc } from '@/lib/userDoc'
import { useAuthStore } from '@/store/auth'
import { useUserProfileStore } from '@/store/userProfile'
import { generateHandleFromEmail } from '@/lib/profile/generateHandle'
import { ensureDefaultWallets, subscribeToWallets } from '@/lib/wallets'
import { useWalletStore } from '@/store/wallets'
import type { WalletMap } from '@/types/wallet'

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
    let hasCheckedAuth = false
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      // Log Firebase config and user for diagnostics
      if (user && typeof window !== 'undefined') {
        const app = getFirebaseApp()
        console.log('[FirebaseAuthListener] Auth state changed', {
          projectId: app.options.projectId,
          currentUserUid: user.uid,
          timestamp: new Date().toISOString(),
        })
      }
      // Mark auth as ready after first check
      if (!hasCheckedAuth) {
        hasCheckedAuth = true
        const { setAuthReady } = useAuthStore.getState()
        setAuthReady()
      }
      
      if (process.env.NODE_ENV !== 'production') {
        console.log('[Firebase] Auth state changed:', user ? `user ${user.uid}` : 'no user')
        
        if (user) {
          // Log user details (dev-only)
          try {
            const tokenResult = await user.getIdTokenResult()
            console.log('[Firebase] User details:', {
              uid: user.uid,
              phoneNumber: user.phoneNumber || null,
              email: user.email || null,
              signInProvider: tokenResult.signInProvider || null,
              claims: {
                email_verified: tokenResult.claims.email_verified || false,
                phone_number: tokenResult.claims.phone_number || null,
              },
            })
          } catch (tokenErr) {
            console.warn('[Firebase] Failed to get token result:', tokenErr)
          }
        }
      }
      
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
        // CRITICAL: Call ensureUserDocument FIRST - it will repair handles and sync profile store
        // Do NOT update profile store here - let ensureUserDocument handle it after repair
        try {
          await ensureUserDocument(user)
          if (process.env.NODE_ENV !== 'production') {
            console.log('[Firebase] ensured user doc', user.uid)
          }
        } catch (error: any) {
          // Log detailed error but don't crash the app
          console.error('[Firebase] Failed to ensure user document on auth state change:', {
            uid: user.uid,
            errorCode: error?.code,
            errorMessage: error?.message,
            path: `users/${user.uid}`,
          })
          // Continue gracefully - user can still use the app even if repair failed
          // The subscription below will still sync profile data from Firestore
        }

        // Subscribe to Firestore user doc snapshots
        unsubscribeDocRef.current = subscribeToCurrentUserDoc((payload) => {
          if (!payload || !payload.data) return
          const { data } = payload
          const { setProfile, profile } = useUserProfileStore.getState()

          setProfile({
            fullName: data.fullName || profile.fullName,
            email: data.email || profile.email,
            avatarUrl: data.avatarUrl || profile.avatarUrl,
            userHandle: data.handle || profile.userHandle,
            // Profile metrics - sync from Firestore or default to 0
            rating: data.rating ?? 0,
            ratingCount: data.ratingCount ?? 0,
            sponsors: data.sponsors ?? 0,
            sponsoring: data.sponsoring ?? 0,
            socialCredit: data.socialCredit ?? 0,
          })

        })

        // HARD RESET on auth transition: Clear demo wallets and set loading state immediately on sign-in
        // This prevents cards from showing demo values during the race condition
        // NOTE: This is CLIENT STATE ONLY - no Firestore writes occur here
        // Firestore balances are preserved, only client state is cleared to prevent demo leaks
        const walletStore = useWalletStore.getState()
        walletStore.setDemoMode(false) // Explicitly disable demo mode
        walletStore.setWalletsStatus('loading') // Mark as loading until Firestore returns data
        // CRITICAL: Clear wallets immediately to prevent demo values from showing
        // Set to empty object so cards show $0 while loading
        // This is client state only - Firestore balances are preserved
        walletStore.setWallets({} as WalletMap)
        // Note: walletAlloc state will be reset to ZERO by its own useEffect when isAuthed changes
        
        console.log('[AUTH_TRANSITION] User authenticated - cleared client state to zero (Firestore preserved)', {
          uid: user.uid,
          timestamp: new Date().toISOString(),
        })
        
        // CRITICAL: Ensure wallets exist in Firestore FIRST (server truth)
        // If wallets don't exist, create them with $0 balances
        // If wallets exist, preserve their balances (no reset - this preserves real balances)
        // Must await completion before subscribing to ensure deterministic initialization
        try {
          await ensureDefaultWallets(user)
          if (process.env.NODE_ENV !== 'production') {
            console.log('[Wallets] Ensured default wallets for user', user.uid)
          }
          
          // Now subscribe to wallet snapshots - Firestore is source of truth
          // The subscription will fire immediately with the wallets we just created
          unsubscribeWalletsRef.current = subscribeToWallets(user.uid, (wallets) => {
            // Firestore wallets are now the source of truth
            walletStore.setWallets(wallets)
            if (process.env.NODE_ENV !== 'production') {
              console.log('[Wallets] Loaded wallets for user', user.uid, Object.keys(wallets))
            }
          })
        } catch (walletErr) {
          console.error('[Firebase] Failed to ensure/subscribe wallets', walletErr)
          // On error, still mark as ready (even if empty) to prevent infinite loading
          walletStore.setWalletsStatus('ready')
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


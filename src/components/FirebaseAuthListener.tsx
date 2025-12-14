'use client'

import { useEffect, useRef } from 'react'
import { getRedirectResult, onAuthStateChanged } from 'firebase/auth'
import { getFirebaseAuth } from '@/lib/firebase'
import { ensureUserDocument, subscribeToCurrentUserDoc } from '@/lib/userDoc'
import { useAuthStore } from '@/store/auth'
import { useUserProfileStore } from '@/store/userProfile'
import { generateHandleFromEmail } from '@/lib/profile/generateHandle'
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
            
            // Capture Google OAuth access token for contact sync (same as popup flow)
            const { GoogleAuthProvider } = await import('firebase/auth')
            const credential = GoogleAuthProvider.credentialFromResult(result)
            if (credential?.accessToken) {
              sessionStorage.setItem('google_access_token', credential.accessToken)
              console.log('[Firebase] Stored Google access token from redirect for contact sync')
            }
            
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
        unsubscribeDocRef.current = subscribeToCurrentUserDoc(async (payload) => {
          if (!payload || !payload.data) return
          const { data } = payload
          const { setProfile, profile } = useUserProfileStore.getState()

          setProfile({
            fullName: data.fullName || profile.fullName,
            email: data.email || profile.email,
            avatarUrl: data.avatarUrl || profile.avatarUrl,
            userHandle: data.handle || profile.userHandle,
          })

          // Trigger automatic Google Contacts sync if enabled
          // Run this after profile is synced to ensure we have user doc data
          if (data.socialGraphShareContacts !== false) {
            try {
              const { syncGoogleContactsOnSignIn } = await import('@/lib/contacts/syncGoogleContactsOnSignIn')
              // Run sync in background (non-blocking)
              syncGoogleContactsOnSignIn(user, data).catch(err => {
                console.error('[Firebase] Failed to sync Google contacts:', err)
              })
            } catch (importErr) {
              console.error('[Firebase] Failed to import contact sync function:', importErr)
            }
          }
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


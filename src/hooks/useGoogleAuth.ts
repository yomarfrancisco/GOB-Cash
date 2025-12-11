'use client'

import { useGoogleLogin } from '@react-oauth/google'
import { signInWithPopup, signInWithRedirect } from 'firebase/auth'
import { useAuthStore } from '@/store/auth'
import { useUserProfileStore } from '@/store/userProfile'
import { useContactsStore } from '@/store/contacts'
import { fetchGoogleContacts } from '@/lib/google/contacts'
import { generateHandleFromEmail } from '@/lib/profile/generateHandle'
import { useNotificationStore } from '@/store/notifications'
import { getFirebaseAuth, getGoogleAuthProvider } from '@/lib/firebase'
import { ensureUserDocument } from '@/lib/userDoc'

/**
 * Hook for Google OAuth authentication
 * Handles sign-in/sign-up flow with profile and contacts import
 * 
 * Note: This hook must only be used in client components that are
 * dynamically imported or rendered client-side only.
 */
export function useGoogleAuth() {
  const { completeAuth, closeAllAuth } = useAuthStore()
  const { setProfile, profile } = useUserProfileStore()
  const { setContacts } = useContactsStore()
  const { pushNotification } = useNotificationStore()

  const handleGoogleSuccess = async (tokenResponse: any) => {
    try {
      // 1. Fetch user profile from Google
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
      })

      if (!userInfoResponse.ok) {
        throw new Error(`Failed to fetch user info: ${userInfoResponse.statusText}`)
      }

      const userInfo = await userInfoResponse.json()

      // Debug: Log userInfo to verify picture URL
      console.log('[GoogleAuth] userInfo', {
        name: userInfo?.name,
        email: userInfo?.email,
        picture: userInfo?.picture,
      })

      // 3. Fetch Google Contacts (non-blocking)
      let contacts: any[] = []
      try {
        contacts = await fetchGoogleContacts(tokenResponse.access_token)
        
        // Log contacts in a friendly console table
        console.groupCollapsed(
          `[GoogleAuth] Retrieved ${contacts.length} contacts from Google People API`
        )
        console.table(
          contacts.map((c) => ({
            name: c.name,
            email: c.email,
            phone: c.phone,
          }))
        )
        console.groupEnd()
      } catch (contactsError) {
        console.warn('Failed to fetch contacts (non-blocking):', contactsError)
        // Continue without contacts
      }

      // 4. Generate handle from email if needed
      const generatedHandle = userInfo.email
        ? generateHandleFromEmail(userInfo.email)
        : profile.userHandle || '@user'

      // 5. Update user profile store
      setProfile({
        fullName: userInfo.name || profile.fullName,
        email: userInfo.email || profile.email,
        avatarUrl: userInfo.picture || profile.avatarUrl,
        // Only update handle if it's the default or doesn't exist
        userHandle:
          !profile.userHandle || profile.userHandle === '@samakoyo'
            ? generatedHandle
            : profile.userHandle,
      })

      // 6. Store contacts
      if (contacts.length > 0) {
        setContacts(contacts)
      }

      // 7. Complete authentication (existing flow)
      completeAuth()
      closeAllAuth()

      // 8. Also sign in with Firebase Auth (additive, non-breaking)
      // This enables Firestore rules and triggers FirebaseAuthListener to ensure user document
      if (typeof window !== 'undefined') {
        try {
          const auth = getFirebaseAuth()
          const googleProvider = getGoogleAuthProvider()
          
          console.log('[GoogleAuth] Starting Firebase Auth sign-in (popup)...')
          
          // Sign in with Firebase Auth using popup (invisible to user since they already authorized)
          // This uses the same Google account they just signed in with
          const result = await signInWithPopup(auth, googleProvider)
          const user = result.user
          
          console.log('[GoogleAuth] Firebase Auth sign-in success:', user.uid)
          
          // Ensure Firestore user document RIGHT HERE
          await ensureUserDocument(user)
          
          console.log('[GoogleAuth] ensureUserDocument completed for', user.uid)
        } catch (err: any) {
          const code = err?.code
          
          if (code === 'auth/popup-blocked') {
            console.warn('[GoogleAuth] Popup blocked, falling back to signInWithRedirect')
            
            try {
              const auth = getFirebaseAuth()
              const googleProvider = getGoogleAuthProvider()
              await signInWithRedirect(auth, googleProvider)
              // Note: After redirect, getRedirectResult will handle ensureUserDocument
              // in FirebaseAuthListener component
            } catch (redirectErr) {
              console.warn('[GoogleAuth] signInWithRedirect also failed', redirectErr)
            }
          } else {
            console.warn('[GoogleAuth] Firebase Auth sign-in or ensureUserDocument FAILED', err)
          }
        }
      } else {
        console.log('[GoogleAuth] Skipped Firebase Auth sign-in (server environment)')
      }

      // 9. Show success notification
      pushNotification({
        kind: 'payment_received', // Using existing kind for system messages
        title: 'Signed in with Google',
        body: `Welcome, ${userInfo.name || 'User'}!`,
        actor: { type: 'system' },
      })
    } catch (error) {
      console.error('Google auth error:', error)
      
      // Show error notification
      pushNotification({
        kind: 'payment_failed', // Using existing kind for errors
        title: 'Google sign-in failed',
        body: error instanceof Error ? error.message : 'Please try again',
        actor: { type: 'system' },
      })
    }
  }

  const login = useGoogleLogin({
    onSuccess: handleGoogleSuccess,
    onError: (error) => {
      console.error('Google login error:', error)
      pushNotification({
        kind: 'payment_failed', // Using existing kind for errors
        title: 'Google sign-in failed',
        body: 'Please try again',
        actor: { type: 'system' },
      })
    },
    scope: [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/contacts.readonly',
      'https://www.googleapis.com/auth/contacts.other.readonly',
    ].join(' '),
  })

  return { login }
}


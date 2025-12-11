/**
 * User document management for Firestore
 * 
 * Ensures user documents exist in /users/{uid} collection with MVP schema.
 * Client-side only - must be called from browser context.
 */

'use client'

import { type User, signInWithCredential, GoogleAuthProvider, onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp, onSnapshot, type DocumentData, Unsubscribe } from 'firebase/firestore'
import { getFirestoreDb, getFirebaseAuth } from './firebase'
import { generateHandleFromEmail } from './profile/generateHandle'
import { ensureDefaultWallets } from './wallets'

/**
 * User document schema (MVP)
 */
export interface UserDocument {
  userId: string
  email: string
  emailVerified: boolean
  fullName: string | null
  handle: string
  displayName: string | null
  avatarUrl: string | null
  createdAt: any // serverTimestamp()
  accountStatus: 'active' | 'suspended' | 'deleted'
  verificationStatus: 'unverified' | 'email-verified' | 'phone-verified' | 'full-verified'
  trustLevel: number // 0-100
  isAgent: boolean
  socialGraphShareContacts?: boolean
}

/**
 * Generate a unique handle from user's name and email
 * Format: @firstname-lastname-XXXX (where XXXX is random suffix)
 */
function generateUniqueHandle(fullName: string | null, email: string): string {
  if (fullName) {
    // Extract first and last name
    const parts = fullName.trim().split(/\s+/)
    const firstName = parts[0]?.toLowerCase() || ''
    const lastName = parts[parts.length - 1]?.toLowerCase() || ''
    
    // Combine and clean
    const base = `${firstName}${lastName ? `-${lastName}` : ''}`.replace(/[^a-z0-9-]/g, '').slice(0, 20)
    
    // Add random 4-digit suffix
    const suffix = Math.floor(1000 + Math.random() * 9000)
    return `@${base}-${suffix}`
  }
  
  // Fallback to email-based handle
  return generateHandleFromEmail(email)
}

/**
 * Ensure a user document exists in Firestore at /users/{uid}
 * 
 * If the document doesn't exist, creates it with MVP schema fields initialized.
 * If it exists, does nothing (for now).
 * 
 * @param user - Firebase Auth User object
 * @returns Promise that resolves when document is ensured
 * @throws Error if Firestore operation fails
 */
export async function ensureUserDocument(user: User): Promise<void> {
  // Guard: only run in browser
  if (typeof window === 'undefined') {
    throw new Error('ensureUserDocument must be called client-side only')
  }

  console.log('[Firebase] ensureUserDocument called with user', {
    uid: user.uid,
    email: user.email,
  })

  const db = getFirestoreDb()
  const userRef = doc(db, 'users', user.uid)

  try {
    // Check if document exists
    const userSnap = await getDoc(userRef)

    if (userSnap.exists()) {
      // Document already exists - sync profile store from Firestore
      console.log(`[UserDoc] User document already exists for ${user.uid}`)
      
      const userData = userSnap.data() as UserDocument
      
      // Sync profile store from Firestore data
      if (typeof window !== 'undefined') {
        const { useUserProfileStore } = await import('@/store/userProfile')
        const profileStore = useUserProfileStore.getState()

        profileStore.setProfile({
          fullName: userData.fullName || user.displayName || profileStore.profile.fullName,
          email: userData.email || user.email || profileStore.profile.email,
          avatarUrl: userData.avatarUrl || user.photoURL || profileStore.profile.avatarUrl,
          userHandle: userData.handle || profileStore.profile.userHandle,
          socialGraphShareContacts:
            userData.socialGraphShareContacts ?? profileStore.profile.socialGraphShareContacts ?? true,
        })
      }
      
      // Ensure wallets subcollection is seeded (idempotent)
      try {
        await ensureDefaultWallets(user)
      } catch (walletErr) {
        console.error('[Firebase] Failed to ensure wallets', walletErr)
      }

      console.log('[Firebase] user doc ensured', user.uid)
      return
    }

    // Generate handle from name + random suffix, or fallback to email
    const handle = generateUniqueHandle(user.displayName, user.email || '')

    // Determine verification status based on emailVerified
    const verificationStatus: UserDocument['verificationStatus'] = user.emailVerified
      ? 'email-verified'
      : 'unverified'

    // Create new user document with MVP schema
    const userDoc: Omit<UserDocument, 'createdAt'> & { createdAt: any } = {
      userId: user.uid,
      email: user.email || '',
      emailVerified: user.emailVerified || false,
      fullName: user.displayName || null,
      handle,
      displayName: user.displayName || null,
      avatarUrl: user.photoURL || null,
      createdAt: serverTimestamp(),
      accountStatus: 'active',
      verificationStatus,
      trustLevel: 0,
      isAgent: false,
      socialGraphShareContacts: true,
    }

    await setDoc(userRef, userDoc)

    console.log(`[UserDoc] Created user document for ${user.uid} with handle ${handle}`)
    // Seed wallets for new user
    try {
      await ensureDefaultWallets(user)
    } catch (walletErr) {
      console.error('[Firebase] Failed to seed wallets for new user', walletErr)
    }
    
    // Sync profile store from newly created document
    if (typeof window !== 'undefined') {
      const { useUserProfileStore } = await import('@/store/userProfile')
      const profileStore = useUserProfileStore.getState()

      profileStore.setProfile({
        fullName: userDoc.fullName || profileStore.profile.fullName,
        email: userDoc.email || profileStore.profile.email,
        avatarUrl: userDoc.avatarUrl || profileStore.profile.avatarUrl,
        userHandle: userDoc.handle || profileStore.profile.userHandle,
        socialGraphShareContacts: userDoc.socialGraphShareContacts ?? true,
      })
    }
    
    console.log('[Firebase] user doc ensured', user.uid)
  } catch (err) {
    console.error('[Firebase] Failed to ensure user doc', err)
    // Don't rethrow - non-fatal error, don't break login UX
  }
}

/**
 * Sign in with Firebase Auth using Google OAuth ID token,
 * then ensure user document exists.
 * 
 * Note: This function requires an ID token from Google OAuth, not an access token.
 * For proper Firebase Auth integration, use Firebase's signInWithPopup or signInWithRedirect
 * with Google provider, which provides the ID token directly.
 * 
 * @param idToken - Google OAuth ID token (not access token)
 * @returns Promise that resolves with Firebase Auth User after document is ensured
 * @throws Error if sign-in or document creation fails
 */
export async function signInWithGoogleIdTokenAndEnsureUser(idToken: string): Promise<User> {
  // Guard: only run in browser
  if (typeof window === 'undefined') {
    throw new Error('signInWithGoogleIdTokenAndEnsureUser must be called client-side only')
  }

  const auth = getFirebaseAuth()
  const credential = GoogleAuthProvider.credential(idToken)
  
  // Sign in with Firebase Auth using Google credential
  const userCredential = await signInWithCredential(auth, credential)
  const user = userCredential.user

  // Ensure user document exists
  await ensureUserDocument(user)

  return user
}

/**
 * Subscribe to the current user's Firestore document.
 * - If signed out: callback(null) and no snapshot.
 * - If signed in: listens to /users/{uid} and calls callback with data.
 * 
 * Returns an unsubscribe function.
 */
export function subscribeToCurrentUserDoc(
  callback: (payload: { uid: string; data: any } | null) => void
): () => void {
  if (typeof window === 'undefined') {
    console.warn('[UserDoc] subscribeToCurrentUserDoc called server-side, skipping')
    return () => {}
  }

  const auth = getFirebaseAuth()
  let docUnsub: Unsubscribe | null = null

  const authUnsub = onAuthStateChanged(auth, (user) => {
    // Clean up previous doc listener
    if (docUnsub) {
      docUnsub()
      docUnsub = null
    }

    if (!user) {
      callback(null)
      return
    }

    const db = getFirestoreDb()
    const userRef = doc(db, 'users', user.uid)

    console.log('[UserDoc] Subscribing to user doc for uid=', user.uid)
    docUnsub = onSnapshot(userRef, (snap) => {
      if (!snap.exists()) {
        callback({ uid: user.uid, data: null })
        return
      }
      const data = snap.data()
      console.log('[UserDoc] Snapshot:', {
        uid: user.uid,
        displayName: data.fullName,
        handle: data.handle,
      })
      callback({ uid: user.uid, data })
    })
  })

  return () => {
    if (docUnsub) docUnsub()
    authUnsub()
  }
}


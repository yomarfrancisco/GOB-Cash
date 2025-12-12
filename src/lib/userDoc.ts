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
  phoneNumber: string | null
  phoneVerified: boolean
  createdAt: any // serverTimestamp()
  accountStatus: 'active' | 'suspended' | 'deleted'
  verificationStatus: 'unverified' | 'email-verified' | 'phone-verified' | 'full-verified'
  trustLevel: number // 0-100
  isAgent: boolean
  socialGraphShareContacts?: boolean
}

/**
 * Generate a unique handle from user's name, email, or phone number
 * Format: @firstname-lastname-XXXX (name), @email-based (email), or @user-XXXX-YYYY (phone)
 */
function generateUniqueHandle(
  fullName: string | null, 
  email: string,
  phoneNumber?: string | null
): string {
  // Priority 1: Use name if available
  if (fullName) {
    const parts = fullName.trim().split(/\s+/)
    const firstName = parts[0]?.toLowerCase() || ''
    const lastName = parts[parts.length - 1]?.toLowerCase() || ''
    
    const base = `${firstName}${lastName ? `-${lastName}` : ''}`.replace(/[^a-z0-9-]/g, '').slice(0, 20)
    const suffix = Math.floor(1000 + Math.random() * 9000)
    return `@${base}-${suffix}`
  }
  
  // Priority 2: Use email if available and not a placeholder
  if (email && !email.includes('@phone.gobankless.local')) {
    return generateHandleFromEmail(email)
  }
  
  // Priority 3: Use phone number (last 4 digits + random 4 digits)
  if (phoneNumber) {
    const digits = phoneNumber.replace(/\D/g, '')
    const last4 = digits.slice(-4) || '0000'
    const rand4 = Math.floor(1000 + Math.random() * 9000)
    return `@user-${last4}-${rand4}`
  }
  
  // Fallback: random handle
  return `@user-${Math.floor(10000 + Math.random() * 90000)}`
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

  if (process.env.NODE_ENV !== 'production') {
    console.log('[Firebase] ensureUserDocument called with user', {
      uid: user.uid,
      email: user.email,
      phoneNumber: user.phoneNumber,
    })
  }

  const db = getFirestoreDb()
  const userRef = doc(db, 'users', user.uid)

  try {
    // Check if document exists
    const userSnap = await getDoc(userRef)

    if (userSnap.exists()) {
      // Document already exists - sync profile store from Firestore
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[UserDoc] User document already exists for ${user.uid}`)
      }
      
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

      if (process.env.NODE_ENV !== 'production') {
        console.log('[Firebase] user doc ensured', user.uid)
      }
      return
    }

    // NEW USER - Create document
    
    // Extract phone number from Firebase user
    const phoneNumber = user.phoneNumber || null
    const phoneVerified = !!phoneNumber
    
    // Determine verification status
    let verificationStatus: UserDocument['verificationStatus'] = 'unverified'
    if (phoneVerified) {
      verificationStatus = 'phone-verified'
    } else if (user.emailVerified) {
      verificationStatus = 'email-verified'
    }
    
    // Generate display name for phone users if missing
    let displayName = user.displayName || null
    let fullName = user.displayName || null
    
    if (!displayName && phoneNumber) {
      // Extract last 4 digits for display name
      const digits = phoneNumber.replace(/\D/g, '')
      const last4 = digits.slice(-4) || '0000'
      displayName = `User ${last4}`
      fullName = null // Phone users don't have full name initially
    }
    
    // Generate handle (pass phoneNumber to function)
    const handle = generateUniqueHandle(
      fullName,
      user.email || '',
      phoneNumber
    )

    // Create email (use placeholder for phone-only users)
    const email = user.email || (phoneNumber 
      ? `${phoneNumber.replace(/\D/g, '')}@phone.gobankless.local` 
      : '')

    // Create new user document with MVP schema
    const userDoc: Omit<UserDocument, 'createdAt'> & { createdAt: any } = {
      userId: user.uid,
      email,
      emailVerified: user.emailVerified || false,
      fullName,
      displayName,
      handle,
      avatarUrl: user.photoURL || null,
      phoneNumber,
      phoneVerified,
      createdAt: serverTimestamp(),
      accountStatus: 'active',
      verificationStatus,
      trustLevel: 0,
      isAgent: false,
      socialGraphShareContacts: true,
    }

    await setDoc(userRef, userDoc)

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[UserDoc] Created user document for ${user.uid} with handle ${handle}`)
    }
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


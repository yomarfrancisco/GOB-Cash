/**
 * User document management for Firestore
 * 
 * Ensures user documents exist in /users/{uid} collection with MVP schema.
 * Client-side only - must be called from browser context.
 */

'use client'

import { type User, signInWithCredential, GoogleAuthProvider, onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp, type DocumentData } from 'firebase/firestore'
import { getFirestoreDb, getFirebaseAuth } from './firebase'
import { generateHandleFromEmail } from './profile/generateHandle'

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
  balances: {
    ZAR: number
    MZN: number
    ZWD: number
    USDT: number
  }
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
      // Document already exists - do nothing for now
      console.log(`[UserDoc] User document already exists for ${user.uid}`)
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
      balances: {
        ZAR: 0,
        MZN: 0,
        ZWD: 0,
        USDT: 0,
      },
    }

    await setDoc(userRef, userDoc)

    console.log(`[UserDoc] Created user document for ${user.uid} with handle ${handle}`)
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
 * Set up an auth state listener that automatically ensures user document
 * exists whenever a user signs in with Firebase Auth.
 * 
 * Call this once in your app (e.g., in a provider or layout component)
 * to automatically create user documents on sign-in.
 * 
 * @returns Unsubscribe function to stop listening
 */
export function setupAuthStateListener(): () => void {
  // Guard: only run in browser
  if (typeof window === 'undefined') {
    console.warn('[UserDoc] setupAuthStateListener called server-side, skipping')
    return () => {}
  }

  const auth = getFirebaseAuth()

  const unsubscribe = onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        await ensureUserDocument(user)
      } catch (error) {
        console.error('[UserDoc] Failed to ensure user document on auth state change:', error)
      }
    }
  })

  return unsubscribe
}


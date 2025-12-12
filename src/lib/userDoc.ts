/**
 * User document management for Firestore
 * 
 * Ensures user documents exist in /users/{uid} collection with MVP schema.
 * Client-side only - must be called from browser context.
 */

'use client'

import { type User, signInWithCredential, GoogleAuthProvider, onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, onSnapshot, type DocumentData, Unsubscribe, collection, query, where, getDocs } from 'firebase/firestore'
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
 * Generate a unique handle in @goblin#### format
 * Collision-safe: checks Firestore for existing handles and retries if needed
 */
async function generateGoblinHandle(db: ReturnType<typeof getFirestoreDb>, maxAttempts = 10): Promise<string> {
  const usersRef = collection(db, 'users')
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const rand4 = Math.floor(1000 + Math.random() * 9000)
    const candidate = `@goblin${rand4}`
    
    // Check if handle already exists
    const handleQuery = query(usersRef, where('handle', '==', candidate))
    const snapshot = await getDocs(handleQuery)
    
    if (snapshot.empty) {
      return candidate
    }
  }
  
  // If all attempts exhausted, use 6 digits instead
  const rand6 = Math.floor(100000 + Math.random() * 900000)
  return `@goblin${rand6}`
}

/**
 * Generate a unique handle from user's name, email, or phone number
 * For phone users: always use @goblin#### format
 * For Google users: use email-based or name-based handle
 */
async function generateUniqueHandle(
  db: ReturnType<typeof getFirestoreDb>,
  fullName: string | null, 
  email: string,
  phoneNumber?: string | null
): Promise<string> {
  // For phone users, always use @goblin#### format
  if (phoneNumber) {
    return generateGoblinHandle(db)
  }
  
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
  
  // Fallback: use goblin format
  return generateGoblinHandle(db)
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
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[HANDLE_REPAIR] Checking user doc for ${user.uid} at path: users/${user.uid}`)
    }
    
    const userSnap = await getDoc(userRef)

    if (userSnap.exists()) {
      // Document already exists - check for repairs needed
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[UserDoc] User document already exists for ${user.uid}`)
      }
      
      const userData = userSnap.data() as UserDocument
      let needsRepair = false
      const updates: Partial<UserDocument> = {}
      
      // Repair invalid handle - THIS MUST RUN ON EVERY LOGIN
      if (!userData.handle || userData.handle === '@' || userData.handle.length < 2) {
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[HANDLE_REPAIR] detected invalid handle "${userData.handle || 'null'}" for ${user.uid}`)
        }
        
        const phoneNumber = user.phoneNumber || userData.phoneNumber || null
        const newHandle = await generateUniqueHandle(
          db,
          userData.fullName || user.displayName,
          userData.email || user.email || '',
          phoneNumber
        )
        updates.handle = newHandle
        needsRepair = true
        
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[HANDLE_REPAIR] generated ${newHandle} for ${user.uid}`)
        }
      }
      
      // Repair phone user defaults if missing
      const phoneNumber = user.phoneNumber || userData.phoneNumber || null
      const phoneVerified = !!phoneNumber
      
      if (phoneNumber && (!userData.phoneNumber || !userData.phoneVerified)) {
        updates.phoneNumber = phoneNumber
        updates.phoneVerified = phoneVerified
        needsRepair = true
      }
      
      // Repair verification status for phone users
      if (phoneVerified && userData.verificationStatus !== 'phone-verified') {
        updates.verificationStatus = 'phone-verified'
        needsRepair = true
      }
      
      // Repair displayName for phone users if missing
      if (phoneNumber && !userData.displayName) {
        const digits = phoneNumber.replace(/\D/g, '')
        const last4 = digits.slice(-4) || '0000'
        updates.displayName = `User ${last4}`
        needsRepair = true
      }
      
      // Apply repairs if needed - MUST COMPLETE BEFORE PROFILE SYNC
      if (needsRepair) {
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[HANDLE_REPAIR] attempting updateDoc for ${user.uid} at path: users/${user.uid}`, updates)
        }
        
        try {
          await updateDoc(userRef, updates)
          if (process.env.NODE_ENV !== 'production') {
            console.log(`[HANDLE_REPAIR] persisted to Firestore for ${user.uid}`, updates)
          }
          
          // Re-fetch to ensure we have the latest data
          const updatedSnap = await getDoc(userRef)
          if (updatedSnap.exists()) {
            Object.assign(userData, updatedSnap.data() as UserDocument)
          }
        } catch (updateError: any) {
          // Log detailed error information
          if (process.env.NODE_ENV !== 'production') {
            console.error(`[HANDLE_REPAIR] FAILED to update Firestore for ${user.uid}:`, {
              errorCode: updateError?.code,
              errorMessage: updateError?.message,
              path: `users/${user.uid}`,
              updates,
              authUid: user.uid,
            })
          }
          
          // Re-throw to be caught by outer try/catch
          throw updateError
        }
      }
      
      // Get final data (after repair and re-fetch)
      const finalData = userData
      
      // Sync profile store from Firestore data
      if (typeof window !== 'undefined') {
        const { useUserProfileStore } = await import('@/store/userProfile')
        const profileStore = useUserProfileStore.getState()

        // CRITICAL: Use repaired handle from Firestore, never fall back to invalid handle
        const validHandle = (finalData.handle && finalData.handle !== '@' && finalData.handle.length > 1)
          ? finalData.handle
          : null

        if (!validHandle) {
          // This should never happen if repair worked, but log if it does
          if (process.env.NODE_ENV !== 'production') {
            console.error(`[HANDLE_REPAIR] WARNING: No valid handle after repair for ${user.uid}`, finalData)
          }
        } else {
          if (process.env.NODE_ENV !== 'production' && needsRepair) {
            console.log(`[HANDLE_REPAIR] profile store updated with ${validHandle} for ${user.uid}`)
          }
        }

        profileStore.setProfile({
          fullName: finalData.fullName || user.displayName || profileStore.profile.fullName,
          email: finalData.email || user.email || profileStore.profile.email,
          avatarUrl: finalData.avatarUrl || user.photoURL || profileStore.profile.avatarUrl,
          userHandle: validHandle || profileStore.profile.userHandle, // Fallback only if repair failed
          socialGraphShareContacts:
            finalData.socialGraphShareContacts ?? profileStore.profile.socialGraphShareContacts ?? true,
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
    const handle = await generateUniqueHandle(
      db,
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

      // Ensure handle is always valid (never "@" or empty)
      const validHandle = (userDoc.handle && userDoc.handle !== '@' && userDoc.handle.length > 1)
        ? userDoc.handle
        : profileStore.profile.userHandle

      profileStore.setProfile({
        fullName: userDoc.fullName || profileStore.profile.fullName,
        email: userDoc.email || profileStore.profile.email,
        avatarUrl: userDoc.avatarUrl || profileStore.profile.avatarUrl,
        userHandle: validHandle || profileStore.profile.userHandle,
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


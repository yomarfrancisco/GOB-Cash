/**
 * Firebase client initialization module
 * 
 * Provides centralized Firebase app, Auth, and Firestore instances.
 * Uses environment variables for configuration (NEXT_PUBLIC_*).
 * 
 * Safe for use in both browser and Next.js server environments.
 */

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

// Firebase configuration from environment variables
const getFirebaseConfig = () => {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID

  // Validate required environment variables
  const missingVars: string[] = []
  if (!apiKey) missingVars.push('NEXT_PUBLIC_FIREBASE_API_KEY')
  if (!authDomain) missingVars.push('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN')
  if (!projectId) missingVars.push('NEXT_PUBLIC_FIREBASE_PROJECT_ID')
  if (!storageBucket) missingVars.push('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET')
  if (!messagingSenderId) missingVars.push('NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID')
  if (!appId) missingVars.push('NEXT_PUBLIC_FIREBASE_APP_ID')

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required Firebase environment variables: ${missingVars.join(', ')}\n` +
      'Please set these in your .env.local file or deployment environment.'
    )
  }

  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
  }
}

// Singleton Firebase app instance
let firebaseApp: FirebaseApp | null = null

/**
 * Get or initialize the Firebase app instance.
 * Initializes only once, even if called multiple times.
 * 
 * @returns Firebase app instance
 * @throws Error if required environment variables are missing
 */
export function getFirebaseApp(): FirebaseApp {
  // Return existing app if already initialized
  if (firebaseApp) {
    return firebaseApp
  }

  // Check if app was already initialized by getApps()
  const existingApps = getApps()
  if (existingApps.length > 0) {
    firebaseApp = existingApps[0]
    return firebaseApp
  }

  // Initialize new app
  const config = getFirebaseConfig()
  firebaseApp = initializeApp(config)
  return firebaseApp
}

/**
 * Get Firebase Auth instance.
 * 
 * @returns Firebase Auth instance
 * @throws Error if Firebase app initialization fails
 */
export function getFirebaseAuth(): Auth {
  const app = getFirebaseApp()
  return getAuth(app)
}

/**
 * Get Firestore database instance.
 * 
 * @returns Firestore database instance
 * @throws Error if Firebase app initialization fails
 */
export function getFirestoreDb(): Firestore {
  const app = getFirebaseApp()
  return getFirestore(app)
}

// Singleton Google Auth Provider instance
let _googleProvider: GoogleAuthProvider | null = null

/**
 * Get Google Auth Provider instance for Firebase Auth.
 * 
 * @returns Google Auth Provider instance
 */
export function getGoogleAuthProvider(): GoogleAuthProvider {
  if (!_googleProvider) {
    _googleProvider = new GoogleAuthProvider()
    _googleProvider.setCustomParameters({ prompt: 'select_account' })
    // No additional scopes; contacts are synced from client-side data
  }
  return _googleProvider
}


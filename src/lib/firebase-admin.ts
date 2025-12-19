/**
 * Firebase Admin SDK initialization for Next.js API routes
 * 
 * Lazy initialization - only initializes when getDb() or getAuth() is called
 * Uses FIREBASE_SERVICE_ACCOUNT_JSON environment variable (Vercel-friendly)
 * 
 * IMPORTANT: Do not initialize at module import time to avoid Vercel build failures
 */

import * as admin from 'firebase-admin'

let adminApp: admin.app.App | null = null
let dbInstance: admin.firestore.Firestore | null = null
let authInstance: admin.auth.Auth | null = null

/**
 * Initialize Firebase Admin SDK lazily
 * Only called when getDb() or getAuth() is first invoked
 */
function initializeAdmin(): void {
  // If already initialized, return early
  if (adminApp) {
    return
  }

  // Check if already initialized by getApps()
  const existingApps = admin.apps
  if (existingApps.length > 0) {
    adminApp = existingApps[0]
    return
  }

  // Get service account JSON from environment variable
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON

  if (!serviceAccountJson) {
    const error = new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON environment variable is required. ' +
      'Set it in Vercel environment variables as a JSON string.'
    )
    console.error('[Firebase Admin] Missing environment variable:', error.message)
    throw error
  }

  try {
    // Parse JSON string
    const serviceAccount = JSON.parse(serviceAccountJson)

    // Fix private_key: replace \\n with \n (common issue when storing in env vars)
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n')
    }

    // Initialize Firebase Admin
    adminApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    })

    console.log('[Firebase Admin] Initialized successfully from FIREBASE_SERVICE_ACCOUNT_JSON')
  } catch (error: any) {
    console.error('[Firebase Admin] Initialization failed:', error)
    if (error instanceof SyntaxError) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is invalid JSON. Check your environment variable.')
    }
    throw new Error(`Firebase Admin initialization failed: ${error.message}`)
  }
}

/**
 * Get Firestore database instance (lazy initialization)
 * Call this inside route handlers, not at module level
 */
export function getDb(): admin.firestore.Firestore {
  if (!dbInstance) {
    initializeAdmin()
    if (!adminApp) {
      throw new Error('Firebase Admin app not initialized')
    }
    dbInstance = admin.firestore()
  }
  return dbInstance
}

/**
 * Get Auth instance (lazy initialization)
 * Call this inside route handlers, not at module level
 */
export function getAuth(): admin.auth.Auth {
  if (!authInstance) {
    initializeAdmin()
    if (!adminApp) {
      throw new Error('Firebase Admin app not initialized')
    }
    authInstance = admin.auth()
  }
  return authInstance
}

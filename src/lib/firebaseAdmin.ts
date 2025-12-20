/**
 * Firebase Admin SDK initialization (alternative approach)
 * Uses individual environment variables instead of JSON blob
 * 
 * Supports both approaches:
 * - FIREBASE_SERVICE_ACCOUNT_JSON (existing)
 * - FIREBASE_ADMIN_PROJECT_ID + FIREBASE_ADMIN_CLIENT_EMAIL + FIREBASE_ADMIN_PRIVATE_KEY (new)
 */

import * as admin from 'firebase-admin'

function getPrivateKey(): string {
  const key = process.env.FIREBASE_ADMIN_PRIVATE_KEY
  if (!key) {
    throw new Error('Missing FIREBASE_ADMIN_PRIVATE_KEY environment variable')
  }
  return key.replace(/\\n/g, '\n')
}

/**
 * Get Firebase Admin app instance
 * Initializes exactly once
 */
export function getAdminApp(): admin.app.App {
  // Check if already initialized
  if (admin.apps.length > 0) {
    return admin.app()
  }

  // Try individual env vars first (new approach)
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY

  if (projectId && clientEmail && privateKey) {
    try {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey: getPrivateKey(),
        }),
      })
      console.log('[Firebase Admin] Initialized from individual env vars')
      return admin.app()
    } catch (error: any) {
      console.error('[Firebase Admin] Initialization from env vars failed:', error)
      throw new Error(`Firebase Admin initialization failed: ${error.message}`)
    }
  }

  // Fallback to FIREBASE_SERVICE_ACCOUNT_JSON (existing approach)
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!serviceAccountJson) {
    throw new Error(
      'Missing Firebase Admin credentials. Set either:\n' +
      '  - FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY\n' +
      '  - OR FIREBASE_SERVICE_ACCOUNT_JSON'
    )
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountJson)
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n')
    }
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    })
    console.log('[Firebase Admin] Initialized from FIREBASE_SERVICE_ACCOUNT_JSON')
    return admin.app()
  } catch (error: any) {
    console.error('[Firebase Admin] Initialization failed:', error)
    if (error instanceof SyntaxError) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is invalid JSON')
    }
    throw new Error(`Firebase Admin initialization failed: ${error.message}`)
  }
}

/**
 * Get Firebase Admin Auth instance
 */
export function getAdminAuth(): admin.auth.Auth {
  getAdminApp()
  return admin.auth()
}

/**
 * Get Firebase Admin Firestore instance
 */
export function getAdminDb(): admin.firestore.Firestore {
  getAdminApp()
  return admin.firestore()
}


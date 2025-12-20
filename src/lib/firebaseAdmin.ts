/**
 * Firebase Admin SDK initialization (hardened singleton)
 * Uses individual environment variables
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

// Singleton instances
let adminApp: admin.app.App | null = null
let adminAuthInstance: admin.auth.Auth | null = null
let adminDbInstance: admin.firestore.Firestore | null = null

/**
 * Initialize Firebase Admin (singleton, only once)
 */
function initializeAdmin(): void {
  // Already initialized
  if (admin.apps.length > 0) {
    adminApp = admin.app()
    return
  }

  // Try individual env vars first (new approach)
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY

  if (projectId && clientEmail && privateKey) {
    try {
      adminApp = admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey: getPrivateKey(), // Already handles \\n -> \n replacement
        }),
      })
      console.log('[Firebase Admin] Initialized from individual env vars, project_id:', projectId)
      return
    } catch (error: any) {
      console.error('[Firebase Admin] Initialization from env vars failed:', error.message)
      throw new Error(`Firebase Admin initialization failed: ${error.message}`)
    }
  }

  // Fallback to FIREBASE_SERVICE_ACCOUNT_JSON (existing approach)
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!serviceAccountJson) {
    const missing = []
    if (!projectId) missing.push('FIREBASE_ADMIN_PROJECT_ID')
    if (!clientEmail) missing.push('FIREBASE_ADMIN_CLIENT_EMAIL')
    if (!privateKey) missing.push('FIREBASE_ADMIN_PRIVATE_KEY')
    throw new Error(
      `Missing Firebase Admin credentials. Set either:\n` +
      `  - FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY\n` +
      `  - OR FIREBASE_SERVICE_ACCOUNT_JSON\n` +
      `Missing: ${missing.join(', ')}`
    )
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountJson)
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n')
    }
    adminApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    })
    const projectId = serviceAccount.project_id || 'unknown'
    console.log('[Firebase Admin] Initialized from FIREBASE_SERVICE_ACCOUNT_JSON, project_id:', projectId)
    return
  } catch (error: any) {
    console.error('[Firebase Admin] Initialization failed:', error.message)
    if (error instanceof SyntaxError) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is invalid JSON')
    }
    throw new Error(`Firebase Admin initialization failed: ${error.message}`)
  }
}

/**
 * Get Firebase Admin app instance (singleton)
 */
export function getAdminApp(): admin.app.App {
  if (!adminApp) {
    initializeAdmin()
  }
  if (!adminApp) {
    throw new Error('Firebase Admin app not initialized')
  }
  return adminApp
}

/**
 * Get Firebase Admin Auth instance (singleton)
 */
export function getAdminAuth(): admin.auth.Auth {
  if (!adminAuthInstance) {
    getAdminApp()
    adminAuthInstance = admin.auth()
  }
  return adminAuthInstance
}

/**
 * Get Firebase Admin Firestore instance (singleton)
 */
export function getAdminDb(): admin.firestore.Firestore {
  if (!adminDbInstance) {
    getAdminApp()
    adminDbInstance = admin.firestore()
  }
  return adminDbInstance
}

// Export singleton instances for convenience
export const adminAuth = (() => {
  getAdminApp()
  return admin.auth()
})()

export const adminDb = (() => {
  getAdminApp()
  return admin.firestore()
})()


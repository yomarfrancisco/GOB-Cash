/**
 * Firebase Admin SDK initialization for Next.js API routes
 * 
 * This module initializes Firebase Admin SDK for server-side operations
 * in Next.js API routes. It uses the service account JSON file.
 */

import * as admin from 'firebase-admin'

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  try {
    // Try to use service account from environment variable or file
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON

    if (serviceAccountJson) {
      // Parse JSON from environment variable (Vercel-friendly)
      try {
        const serviceAccount = JSON.parse(serviceAccountJson)
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        })
        console.log('[Firebase Admin] Initialized from FIREBASE_SERVICE_ACCOUNT_JSON')
      } catch (parseError) {
        console.error('[Firebase Admin] Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', parseError)
        throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is invalid JSON')
      }
    } else if (serviceAccountPath) {
      // Load from file path
      try {
        const serviceAccount = require(serviceAccountPath)
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        })
        console.log('[Firebase Admin] Initialized from FIREBASE_SERVICE_ACCOUNT_PATH:', serviceAccountPath)
      } catch (requireError) {
        console.error('[Firebase Admin] Failed to load service account from path:', serviceAccountPath, requireError)
        throw new Error(`Failed to load service account from ${serviceAccountPath}`)
      }
    } else {
      // Try default service account file location (local development)
      try {
        const serviceAccount = require('../../../gobankless-dev-firebase-adminsdk-fbsvc-f9e7a2ca07.json')
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        })
        console.log('[Firebase Admin] Initialized from default service account file')
      } catch (defaultError) {
        console.error('[Firebase Admin] Failed to initialize:', defaultError)
        console.error('[Firebase Admin] Missing environment variables: FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH')
        throw new Error(
          'Firebase Admin initialization failed. Set FIREBASE_SERVICE_ACCOUNT_JSON (JSON string) or FIREBASE_SERVICE_ACCOUNT_PATH (file path)'
        )
      }
    }
  } catch (error: any) {
    console.error('[Firebase Admin] Initialization error:', error)
    throw new Error(`Firebase Admin initialization failed: ${error.message}`)
  }
}

export const db = admin.firestore()
export const auth = admin.auth()


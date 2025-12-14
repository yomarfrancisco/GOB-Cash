/**
 * Call the deployed admin_backfillDirectory Cloud Function
 * 
 * Usage:
 *   node scripts/callBackfillFunction.js
 * 
 * Requires:
 *   - Firebase CLI authenticated (firebase login)
 *   - User must have admin custom claim set
 */

const { initializeApp } = require('firebase/app')
const { getAuth, signInWithCustomToken } = require('firebase/auth')
const { getFunctions, httpsCallable } = require('firebase/functions')

// This won't work from Node.js - we need browser context or service account
// Let me create a better solution using the Firebase Admin SDK with token

console.log('This script requires browser context or service account.')
console.log('Please run the backfill from browser console instead:')
console.log('')
console.log('1. Sign in to the app')
console.log('2. Open browser console (F12)')
console.log('3. Run:')
console.log('')
console.log('import { getFunctions, httpsCallable } from "firebase/functions"')
console.log('import { getFirebaseApp } from "@/lib/firebase"')
console.log('')
console.log('const functions = getFunctions(getFirebaseApp(), "us-central1")')
console.log('const backfill = httpsCallable(functions, "admin_backfillDirectory")')
console.log('const result = await backfill({})')
console.log('console.log("Backfill result:", result.data)')
console.log('')
console.log('Or use a service account key file:')
console.log('export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account-key.json"')
console.log('node scripts/backfillDirectory.js')

process.exit(1)



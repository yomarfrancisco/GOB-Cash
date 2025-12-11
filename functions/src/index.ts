/**
 * Firebase Cloud Functions entry point
 * 
 * Exports:
 * - onContactWrite: Triggered when contacts are written
 * - recomputeGhostQuality: Scheduled function to recompute ghost quality scores
 */

import * as admin from 'firebase-admin'

// Initialize Firebase Admin
admin.initializeApp()

// Export functions
export { onContactWrite } from './onContactWrite'
export { recomputeGhostQuality } from './recomputeGhostQuality'


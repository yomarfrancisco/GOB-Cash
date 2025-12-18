/**
 * Cloud Function: wallet_ensureTronAddress
 * 
 * Ensures user has a TRON address assigned (derived from HD wallet).
 * Idempotent: returns existing address if already assigned.
 */

import * as functions from 'firebase-functions'
import { ensureTronAddress } from '../utils/tronHdWallet'

export const wallet_ensureTronAddress = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    // Require authentication
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required')
    }

    const userId = context.auth.uid

    try {
      const { address, index, path } = await ensureTronAddress(userId)
      
      return {
        address,
        index,
        path,
      }
    } catch (error: any) {
      console.error('[wallet_ensureTronAddress] Error:', error)
      throw new functions.https.HttpsError(
        'internal',
        'Failed to ensure TRON address',
        error.message
      )
    }
  })


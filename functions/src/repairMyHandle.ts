/**
 * Cloud Function: repairMyHandle
 * 
 * Repairs invalid handles for authenticated users using Admin SDK (bypasses client rules).
 * Called by client when handle is missing, "@", or too short.
 * 
 * Requires: authenticated user (request.auth.uid must match)
 * Returns: { handle: string, displayName: string | null }
 */

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

const db = admin.firestore()

/**
 * Generate a unique goblin handle with collision checking
 */
async function generateGoblinHandle(maxAttempts = 10): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const rand4 = Math.floor(1000 + Math.random() * 9000)
    const candidate = `@goblin${rand4}`
    
    // Check if handle already exists
    const snapshot = await db.collection('users')
      .where('handle', '==', candidate)
      .limit(1)
      .get()
    
    if (snapshot.empty) {
      return candidate
    }
  }
  
  // If all attempts exhausted, use 6 digits instead
  const rand6 = Math.floor(100000 + Math.random() * 900000)
  return `@goblin${rand6}`
}

export const repairMyHandle = functions.region('us-central1').https.onCall(async (data, context) => {
  // Require authentication
  if (!context.auth) {
    console.error('[repairMyHandle] Unauthenticated request')
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated to repair handle'
    )
  }

  const uid = context.auth.uid
  console.log(`[repairMyHandle] Called for uid: ${uid}`)
  const userRef = db.collection('users').doc(uid)

  try {
    // Read current user document
    const userSnap = await userRef.get()
    
    if (!userSnap.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'User document does not exist'
      )
    }

    const userData = userSnap.data()!
    const currentHandle = userData.handle || null
    
    // Check if handle needs repair
    if (currentHandle && currentHandle !== '@' && currentHandle.length >= 2) {
      // Handle is valid, return current values
      console.log(`[repairMyHandle] Handle already valid: ${currentHandle}`)
      return {
        handle: currentHandle,
        displayName: userData.displayName || null,
      }
    }

    // Generate new handle
    console.log(`[repairMyHandle] Repairing invalid handle: "${currentHandle || 'null'}"`)
    const phoneNumber = userData.phoneNumber || null
    const newHandle = await generateGoblinHandle()
    console.log(`[repairMyHandle] Generated new handle: ${newHandle}`)
    
    // Prepare updates
    const updates: any = {
      handle: newHandle,
    }

    // Repair displayName for phone users if missing
    if (phoneNumber && !userData.displayName) {
      const digits = phoneNumber.replace(/\D/g, '')
      const last4 = digits.slice(-4) || '0000'
      updates.displayName = `User ${last4}`
    }

    // Repair phone user defaults if missing
    if (phoneNumber) {
      if (!userData.phoneNumber) {
        updates.phoneNumber = phoneNumber
      }
      if (!userData.phoneVerified) {
        updates.phoneVerified = true
      }
      if (userData.verificationStatus !== 'phone-verified') {
        updates.verificationStatus = 'phone-verified'
      }
    }

    // Write using Admin SDK (bypasses client rules)
    console.log(`[repairMyHandle] Updating user doc with:`, Object.keys(updates))
    await userRef.update(updates)
    console.log(`[repairMyHandle] Successfully updated user doc for ${uid}`)

    return {
      handle: newHandle,
      displayName: updates.displayName || userData.displayName || null,
    }
  } catch (error: any) {
    console.error('[repairMyHandle] Error:', error)
    
    if (error instanceof functions.https.HttpsError) {
      throw error
    }
    
    throw new functions.https.HttpsError(
      'internal',
      'Failed to repair handle',
      error.message
    )
  }
})


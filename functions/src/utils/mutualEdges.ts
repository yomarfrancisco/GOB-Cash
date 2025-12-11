/**
 * Mutual edges utility
 * Handles detection and marking of mutual connections between users
 */

import * as admin from 'firebase-admin'
import { normalizeHandle } from './handleNormalization'
import { generateEdgeId } from './edgeId'

const db = admin.firestore()

/**
 * Ensures mutual edge marking and updates directory counts
 * Called after creating/updating an edge A → B
 * 
 * @param fromUserId - User ID who has the contact (A)
 * @param toHandle - Normalized handle of the contact (B)
 * @param edgeSource - Source of the edge (e.g., 'deviceContacts')
 * @returns Promise that resolves when mutual logic is complete
 */
export async function ensureMutualEdgeAndCounts(
  fromUserId: string,
  toHandle: string,
  edgeSource: string
): Promise<void> {
  try {
    // Get directory doc for toHandle to check if it's claimed
    const directoryRef = db.collection('directory').doc(toHandle)
    const directoryDoc = await directoryRef.get()

    if (!directoryDoc.exists) {
      // Directory entry doesn't exist yet, skip mutual logic
      return
    }

    const directoryData = directoryDoc.data()
    const otherUserId = directoryData?.ownerUserId

    // Skip if handle is not claimed (no ownerUserId)
    if (!otherUserId || otherUserId === null) {
      return
    }

    // Get current user's handle from /users/{fromUserId}
    const userRef = db.collection('users').doc(fromUserId)
    const userDoc = await userRef.get()

    if (!userDoc.exists) {
      console.log('[MutualEdges] User document not found', { fromUserId })
      return
    }

    const userData = userDoc.data()
    const userHandleRaw = userData?.handle

    if (!userHandleRaw) {
      console.log('[MutualEdges] User handle not found', { fromUserId })
      return
    }

    // Normalize user's handle to match directory key format ($ prefix)
    const normalizedUserHandle = normalizeHandle(userHandleRaw)
    if (!normalizedUserHandle) {
      console.log('[MutualEdges] Could not normalize user handle', {
        fromUserId,
        userHandleRaw,
      })
      return
    }

    // Check for reverse edge: otherUserId → normalizedUserHandle
    // Try different sources since the reverse edge might have a different source
    const possibleSources = ['deviceContacts', 'gmail', 'manual']
    let reverseEdgeRef: admin.firestore.DocumentReference | null = null
    let reverseEdgeDoc: admin.firestore.DocumentSnapshot | null = null

    for (const source of possibleSources) {
      const reverseEdgeId = generateEdgeId(otherUserId, normalizedUserHandle, 'contact', source)
      const ref = db.collection('graphEdges').doc(reverseEdgeId)
      const doc = await ref.get()
      if (doc.exists) {
        reverseEdgeRef = ref
        reverseEdgeDoc = doc
        break
      }
    }

    if (!reverseEdgeDoc || !reverseEdgeDoc.exists || !reverseEdgeRef) {
      // No reverse edge exists, not mutual
      return
    }

    const reverseEdgeData = reverseEdgeDoc.data()
    const wasAlreadyMutual = reverseEdgeData?.isMutual === true

    // Check current edge's mutual status
    const currentEdgeId = generateEdgeId(fromUserId, toHandle, 'contact', edgeSource)
    const currentEdgeRef = db.collection('graphEdges').doc(currentEdgeId)
    const currentEdgeDoc = await currentEdgeRef.get()
    const currentEdgeData = currentEdgeDoc.data()
    const currentWasMutual = currentEdgeData?.isMutual === true

    // If both edges already marked as mutual, skip
    if (wasAlreadyMutual && currentWasMutual) {
      return
    }

    // Mark both edges as mutual
    const now = admin.firestore.Timestamp.now()
    const batch = db.batch()

    // Update current edge (A → B)
    batch.update(currentEdgeRef, {
      isMutual: true,
      updatedAt: now,
    })

    // Update reverse edge (B → A)
    batch.update(reverseEdgeRef, {
      isMutual: true,
      updatedAt: now,
    })

    // Only increment mutual counts if we're transitioning from non-mutual to mutual
    if (!wasAlreadyMutual || !currentWasMutual) {
      // Get directory refs for both handles
      const userDirectoryRef = db.collection('directory').doc(normalizedUserHandle)
      const contactDirectoryRef = directoryRef

      // Increment inboundMutualCount for both directory entries
      batch.update(userDirectoryRef, {
        inboundMutualCount: admin.firestore.FieldValue.increment(1),
        updatedAt: now,
      })

      batch.update(contactDirectoryRef, {
        inboundMutualCount: admin.firestore.FieldValue.increment(1),
        updatedAt: now,
      })

      console.log('[MutualEdges] Marked mutual between', {
        fromUserId,
        otherUserId,
        userHandle: normalizedUserHandle,
        toHandle,
        wasAlreadyMutual,
        currentWasMutual,
      })
    }

    await batch.commit()
  } catch (error) {
    console.error('[MutualEdges] Error ensuring mutual edge', {
      fromUserId,
      toHandle,
      error: error instanceof Error ? error.message : String(error),
    })
    // Don't throw - mutual detection is best-effort
  }
}


/**
 * Cloud Function: onContactWrite
 * Triggered when a contact is created, updated, or deleted in /users/{userId}/contacts/{contactId}
 * 
 * Behavior:
 * - Creates/updates graphEdges entries
 * - Updates directory entries with inboundEdgeCount and avgContactCompleteness
 * - Skips deletion cleanup (minimal backend)
 */

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { deriveHandleFromContact } from './utils/handleNormalization'
import { generateEdgeId } from './utils/edgeId'
import { computeContactCompleteness } from './utils/contactCompleteness'
import { ensureMutualEdgeAndCounts } from './utils/mutualEdges'

const db = admin.firestore()

interface ContactDoc {
  contactId: string
  displayName: string | null
  handle: string | null
  primaryEmail: string | null
  primaryPhone: string | null
  source: 'device' | 'gmail' | 'manual' | string // Allow string for flexibility
  createdAt: admin.firestore.Timestamp
  updatedAt: admin.firestore.Timestamp
}

export const onContactWrite = functions.firestore
  .document('users/{userId}/contacts/{contactId}')
  .onWrite(async (change, context) => {
    const userId = context.params.userId
    const contactId = context.params.contactId

    const before = change.before.exists ? (change.before.data() as ContactDoc) : null
    const after = change.after.exists ? (change.after.data() as ContactDoc) : null

    // Handle deletion: log and return (skip edge cleanup for minimal backend)
    if (!after && before) {
      console.log('[onContactWrite] Contact deleted', { userId, contactId })
      return null
    }

    // Skip if contact doesn't exist after write
    if (!after) {
      console.warn('[onContactWrite] Contact missing after write', { userId, contactId })
      return null
    }

    // Derive handle from contact
    const toHandle = deriveHandleFromContact(after)
    if (!toHandle) {
      console.log('[onContactWrite] Could not derive handle from contact', {
        userId,
        contactId,
        contact: {
          handle: after.handle,
          primaryEmail: after.primaryEmail,
          displayName: after.displayName,
        },
      })
      return null
    }

    // Map contact source to edge source
    // Contact source: 'device' -> Edge source: 'deviceContacts'
    // Contact source: 'gmail' -> Edge source: 'gmail'
    // Contact source: 'manual' -> Edge source: 'manual'
    const edgeSource = after.source === 'device' 
      ? 'deviceContacts' 
      : after.source === 'gmail' 
      ? 'gmail' 
      : after.source === 'manual'
      ? 'manual'
      : 'deviceContacts' // Default fallback

    // Compute edge ID
    const edgeId = generateEdgeId(userId, toHandle, 'contact', edgeSource)

    // Compute contact completeness
    const completeness = computeContactCompleteness({
      displayName: after.displayName,
      primaryEmail: after.primaryEmail,
      primaryPhone: after.primaryPhone,
    })

    const now = admin.firestore.Timestamp.now()

    try {
      // Upsert graph edge
      const edgeRef = db.collection('graphEdges').doc(edgeId)
      const edgeDoc = await edgeRef.get()
      const isNewEdge = !edgeDoc.exists

      const edgeData = {
        edgeId,
        fromUserId: userId,
        toHandle,
        toUserId: null, // Will be populated when handle is claimed
        edgeType: 'contact' as const,
        source: edgeSource as 'deviceContacts' | 'gmail' | 'manual',
        weight: 1,
        isMutual: false, // Will be computed later in batch job
        updatedAt: now,
      }

      if (isNewEdge) {
        // New edge
        await edgeRef.set({
          ...edgeData,
          createdAt: now,
        })
        console.log('[onContactWrite] Created graph edge', { edgeId, userId, toHandle })
      } else {
        // Update existing edge
        await edgeRef.update(edgeData)
        console.log('[onContactWrite] Updated graph edge', { edgeId, userId, toHandle })
      }

      // Update directory entry
      const directoryRef = db.collection('directory').doc(toHandle)
      const directoryDoc = await directoryRef.get()

      if (!directoryDoc.exists) {
        // Create new directory entry
        const inboundSourceCounts: Record<string, number> = {}
        inboundSourceCounts[edgeSource] = 1

        await directoryRef.set({
          handle: toHandle,
          displayName: after.displayName,
          ownerUserId: null,
          inboundEdgeCount: 1,
          inboundMutualCount: 0,
          inboundSourceCounts,
          avgContactCompleteness: completeness,
          ghostQuality: 0, // Will be computed by scheduled function
          lastInboundAt: now,
          createdAt: now,
          updatedAt: now,
        })
        console.log('[onContactWrite] Created directory entry', { toHandle, edgeSource })
      } else {
        // Update existing directory entry
        const existingData = directoryDoc.data()
        const currentInboundCount = existingData?.inboundEdgeCount || 0

        // Only increment inboundEdgeCount if this is a new edge (first time this fromUserId has this toHandle)
        // We already computed isNewEdge above when checking the graphEdges document

        // Update avgContactCompleteness with running average
        const currentAvg = existingData?.avgContactCompleteness || 0
        let newAvg: number

        if (isNewEdge) {
          // New edge: add to running average
          newAvg = (currentAvg * currentInboundCount + completeness) / (currentInboundCount + 1)
        } else {
          // Existing edge: update the average (simplified - just recalculate with current completeness)
          // For minimal backend, we'll use a simple approach: weighted average
          newAvg = currentAvg * 0.9 + completeness * 0.1 // Slight decay + new value
        }

        const updateData: any = {
          displayName: after.displayName || existingData?.displayName || null,
          avgContactCompleteness: Math.max(0, Math.min(1, newAvg)),
          updatedAt: now,
        }

        if (isNewEdge) {
          updateData.inboundEdgeCount = admin.firestore.FieldValue.increment(1)
          updateData.lastInboundAt = now

          // Update inboundSourceCounts
          const existingSourceCounts = existingData?.inboundSourceCounts || {}
          const newSourceCounts = { ...existingSourceCounts }
          newSourceCounts[edgeSource] = (newSourceCounts[edgeSource] || 0) + 1
          updateData.inboundSourceCounts = newSourceCounts

          // Initialize inboundMutualCount if missing
          if (existingData?.inboundMutualCount === undefined) {
            updateData.inboundMutualCount = 0
          }
        }

        await directoryRef.update(updateData)
        console.log('[onContactWrite] Updated directory entry', {
          toHandle,
          isNewEdge,
          edgeSource,
          inboundCount: isNewEdge ? currentInboundCount + 1 : currentInboundCount,
        })
      }

      // Check for mutual edges (only for new edges to avoid unnecessary work)
      if (isNewEdge) {
        await ensureMutualEdgeAndCounts(userId, toHandle, edgeSource)
      }

      return null
    } catch (error) {
      console.error('[onContactWrite] Error processing contact write', {
        userId,
        contactId,
        toHandle,
        error: error instanceof Error ? error.message : String(error),
      })
      // Don't throw - we don't want to retry on every contact write failure
      return null
    }
  })


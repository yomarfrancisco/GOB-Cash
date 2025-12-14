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
import { deriveHandleFromContact, normalizeHandle } from './utils/handleNormalization'
import { generateEdgeId } from './utils/edgeId'
import { computeContactCompleteness } from './utils/contactCompleteness'
import { ensureMutualEdgeAndCounts } from './utils/mutualEdges'
import { extractPhoneCountry } from './utils/phoneCountry'

const db = admin.firestore()

/**
 * Sync contact to globalContactsPublic and globalContactsPrivate
 * Merges data intelligently when handle already exists
 */
async function syncToGlobalContacts(
  userId: string,
  contact: ContactDoc
): Promise<void> {
  // Skip if no handle
  if (!contact.handle) {
    return
  }

  // Normalize handle
  const normalizedHandle = normalizeHandle(contact.handle)
  if (!normalizedHandle) {
    return
  }

  const now = admin.firestore.Timestamp.now()

  // 1. Upsert globalContactsPublic
  const publicRef = db.collection('globalContactsPublic').doc(normalizedHandle)
  const publicDoc = await publicRef.get()

  const publicData: any = {
    handle: normalizedHandle,
    updatedAt: now,
  }

  // Merge displayName: prefer most recently updated
  if (publicDoc.exists) {
    const existingData = publicDoc.data()
    if (contact.displayName && (!existingData?.displayName || contact.updatedAt >= (existingData.updatedAt || now))) {
      publicData.displayName = contact.displayName
    } else if (existingData?.displayName) {
      publicData.displayName = existingData.displayName
    }

    // Merge sources: union unique values
    const existingSources = new Set(existingData?.sources || [])
    if (contact.source) {
      existingSources.add(contact.source)
    }
    publicData.sources = Array.from(existingSources)

    if (existingData?.createdAt) {
      publicData.createdAt = existingData.createdAt
    } else {
      publicData.createdAt = now
    }

    await publicRef.update(publicData)
  } else {
    // New entry
    publicData.displayName = contact.displayName || null
    publicData.sources = contact.source ? [contact.source] : []
    publicData.createdAt = now
    await publicRef.set(publicData)
  }

  // 2. Upsert globalContactsPrivate (only if we have email or phone)
  if (contact.primaryEmail || contact.primaryPhone) {
    const privateRef = db.collection('globalContactsPrivate').doc(normalizedHandle)
    const privateDoc = await privateRef.get()

    const privateData: any = {
      handle: normalizedHandle,
      updatedAt: now,
    }

    // Merge email: prefer most recently updated
    if (privateDoc.exists) {
      const existingData = privateDoc.data()
      
      if (contact.primaryEmail && (!existingData?.primaryEmail || contact.updatedAt >= (existingData.updatedAt || now))) {
        privateData.primaryEmail = contact.primaryEmail
      } else if (existingData?.primaryEmail) {
        privateData.primaryEmail = existingData.primaryEmail
      }

      // Merge phone: prefer most recently updated
      if (contact.primaryPhone && (!existingData?.primaryPhone || contact.updatedAt >= (existingData.updatedAt || now))) {
        privateData.primaryPhone = contact.primaryPhone
      } else if (existingData?.primaryPhone) {
        privateData.primaryPhone = existingData.primaryPhone
      }

      if (existingData?.createdAt) {
        privateData.createdAt = existingData.createdAt
      } else {
        privateData.createdAt = now
      }

      await privateRef.update(privateData)
    } else {
      // New entry
      if (contact.primaryEmail) {
        privateData.primaryEmail = contact.primaryEmail
      }
      if (contact.primaryPhone) {
        privateData.primaryPhone = contact.primaryPhone
      }
      privateData.createdAt = now
      await privateRef.set(privateData)
    }
  }
}

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

        // Extract phone country from primaryPhone if available
        const phoneCountry = extractPhoneCountry(after.primaryPhone)

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
          phoneCountry: phoneCountry || null, // Store inferred country
          createdAt: now,
          updatedAt: now,
        })
        console.log('[onContactWrite] Created directory entry', { toHandle, edgeSource, phoneCountry })
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

        // Extract phone country from primaryPhone if available
        // Only update if we have a phone and don't already have a country, or if this is a new edge
        const phoneCountry = extractPhoneCountry(after.primaryPhone)
        const shouldUpdatePhoneCountry = phoneCountry && (
          !existingData?.phoneCountry || // No existing country
          isNewEdge // New edge might have better data
        )

        const updateData: any = {
          displayName: after.displayName || existingData?.displayName || null,
          avgContactCompleteness: Math.max(0, Math.min(1, newAvg)),
          updatedAt: now,
        }

        // Update phone country if we have new data
        if (shouldUpdatePhoneCountry) {
          updateData.phoneCountry = phoneCountry
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

      // Sync to globalContactsPublic and globalContactsPrivate
      await syncToGlobalContacts(userId, after).catch(err => {
        console.error('[onContactWrite] Failed to sync to globalContacts', {
          userId,
          contactId,
          error: err instanceof Error ? err.message : String(err),
        })
        // Don't throw - this is best-effort
      })

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


'use client'

import {
  collection,
  doc,
  setDoc,
  writeBatch,
  serverTimestamp,
  getDoc,
} from 'firebase/firestore'
import { getFirestoreDb } from '@/lib/firebase'
import type { ContactDoc, DirectoryDoc } from '@/types/contacts'
import { upsertGraphEdge } from '@/lib/socialGraph'
import { incrementDirectoryInboundCount, updateGhostQuality } from '@/lib/ghostQuality'
import { computeContactCompleteness } from '@/lib/socialMetrics'
import { recomputeSocialMetrics } from '@/lib/socialMetrics'
import {
  CONTACT_SYNC_LIMIT_PER_USER,
  CONTACT_SYNC_BATCH_SIZE,
} from '@/config/contactSync'
import {
  loadContactSyncState,
  saveContactSyncState,
  type ContactSyncState,
} from '@/lib/contactSyncState'

export const getUserContactsCollectionRef = (userId: string) =>
  collection(getFirestoreDb(), 'users', userId, 'contacts')

export const getDirectoryDocRef = (handle: string) =>
  doc(getFirestoreDb(), 'directory', handle.toLowerCase())

export const normalizeHandle = (handle?: string | null): string | undefined => {
  if (!handle) return undefined
  let h = handle.trim()
  if (!h) return undefined
  if (!h.startsWith('$')) h = `$${h}`
  return h.toLowerCase()
}

/**
 * Build a stable contactId for storage.
 * Priority: handle -> email -> phone -> local id -> random fallback
 */
export const buildContactId = (c: {
  handle?: string
  email?: string
  phone?: string
  id?: string
}): string => {
  const h = normalizeHandle(c.handle)
  if (h) return `handle:${h}`
  if (c.email) return `email:${c.email.toLowerCase()}`
  if (c.phone) return `phone:${c.phone.replace(/\s+/g, '')}`
  if (c.id) return `local:${c.id}`
  return `local:${Math.random().toString(36).slice(2)}`
}

type LocalContact = {
  id?: string
  name: string
  handle?: string
  phone?: string
  email?: string
  avatarUrl?: string
  tags?: string[]
}

type NormalizedContact = {
  contactId: string
  raw: LocalContact
}

/**
 * Upsert a single contact for a user (used in batched upload)
 */
async function upsertContactForUser(
  userId: string,
  contact: NormalizedContact
): Promise<void> {
  const db = getFirestoreDb()
  const now = serverTimestamp()
  const raw = contact.raw
  const handle = normalizeHandle(raw.handle)
  const contactId = contact.contactId

  const contactDoc: ContactDoc = {
    contactId,
    displayName: raw.name || null,
    handle: handle || null,
    primaryEmail: raw.email || null,
    primaryPhone: raw.phone || null,
    source: 'device',
    createdAt: now,
    updatedAt: now,
  }

  try {
    const contactRef = doc(getUserContactsCollectionRef(userId), contactId)
    await setDoc(contactRef, contactDoc, { merge: true })

    // Write directory entry and create graph edge (best-effort, non-blocking)
    if (handle) {
      try {
        const dirRef = getDirectoryDocRef(handle)
        const dirDoc = await getDoc(dirRef)
        const existingDirData = dirDoc.data()

        const directoryDoc: DirectoryDoc = {
          handle,
          ownerUserId: existingDirData?.ownerUserId || null,
          displayName: raw.name || existingDirData?.displayName || null,
          createdAt: existingDirData?.createdAt || now,
          updatedAt: now,
        }
        await setDoc(dirRef, directoryDoc, { merge: true })

        // Increment inbound edge count
        incrementDirectoryInboundCount(handle).catch(() => {})

        // Compute contact completeness and update ghost quality
        const completeness = computeContactCompleteness({
          displayName: raw.name,
          primaryEmail: raw.email,
          primaryPhone: raw.phone,
        })
        updateGhostQuality(handle, completeness).catch(() => {})

        // Create graph edge
        const dirData = dirDoc.data()
        const toUserId = dirData?.ownerUserId || null
        upsertGraphEdge({
          fromUserId: userId,
          toHandle: handle,
          toUserId,
          edgeType: 'contact',
          source: 'deviceContacts',
          weight: 1,
        }).catch(() => {})
      } catch (err) {
        // Directory/graph updates are best-effort
        console.error('[ContactsSync] Failed directory/graph update', { handle, error: err })
      }
    }
  } catch (err) {
    console.error('[ContactsSync] Firestore error writing contact', {
      uid: userId,
      contactId,
      error: err,
    })
    throw err
  }
}

/**
 * Upload contacts in batches to keep UI responsive
 */
async function uploadContactsInBatches(
  uid: string,
  contacts: NormalizedContact[],
  upsertContactForUserFn: (uid: string, contact: NormalizedContact) => Promise<void>,
): Promise<{
  newContactsUploaded: number
  totalSynced: number
  hasMoreToSync: boolean
}> {
  const state: ContactSyncState = loadContactSyncState(uid)
  const existing = new Set(state.syncedContactIds)
  const unsynced = contacts.filter((c) => !existing.has(c.contactId))
  const remainingCapacity = CONTACT_SYNC_LIMIT_PER_USER - state.syncedContactIds.length

  if (remainingCapacity <= 0 || unsynced.length === 0) {
    return {
      newContactsUploaded: 0,
      totalSynced: state.syncedContactIds.length,
      hasMoreToSync: false,
    }
  }

  // PHASE 2: Log before trimming to limit
  console.log('[ContactSync] before trim to limit, size =', unsynced.length, {
    limit: CONTACT_SYNC_LIMIT_PER_USER,
    alreadySynced: state.syncedContactIds.length,
    remainingCapacity,
  })

  const toUpload = unsynced.slice(0, remainingCapacity)
  let uploadIndex = 0
  let newCount = 0

  while (
    uploadIndex < toUpload.length &&
    state.syncedContactIds.length < CONTACT_SYNC_LIMIT_PER_USER
  ) {
    const batch = toUpload.slice(
      uploadIndex,
      uploadIndex + CONTACT_SYNC_BATCH_SIZE,
    )

    await Promise.allSettled(
      batch.map((contact) => upsertContactForUserFn(uid, contact)),
    )

    for (const contact of batch) {
      if (!existing.has(contact.contactId)) {
        existing.add(contact.contactId)
        state.syncedContactIds.push(contact.contactId)
        newCount += 1
      }
    }

    uploadIndex += CONTACT_SYNC_BATCH_SIZE
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  state.lastSyncAt = new Date().toISOString()
  saveContactSyncState(uid, state)

  const hasMoreToSync =
    uploadIndex < unsynced.length &&
    state.syncedContactIds.length < CONTACT_SYNC_LIMIT_PER_USER

  // PHASE 2: Log why we stopped
  if (state.syncedContactIds.length >= CONTACT_SYNC_LIMIT_PER_USER) {
    console.log('[ContactSync] stopped: hit limit', {
      totalSynced: state.syncedContactIds.length,
      limit: CONTACT_SYNC_LIMIT_PER_USER,
    })
  } else if (uploadIndex >= unsynced.length) {
    console.log('[ContactSync] stopped: no more contacts from device', {
      totalSynced: state.syncedContactIds.length,
      uploadedThisRun: newCount,
    })
  }

  if (typeof window !== 'undefined') {
    console.log('[ContactsSync] summary', {
      uid,
      newContactsUploaded: newCount,
      totalSynced: state.syncedContactIds.length,
      hasMoreToSync,
    })
  }

  return {
    newContactsUploaded: newCount,
    totalSynced: state.syncedContactIds.length,
    hasMoreToSync,
  }
}

/**
 * Sync a batch of local contacts to Firestore (batched, incremental).
 * - Upserts `/users/{uid}/contacts/{contactId}`
 * - Upserts `/directory/{handle}` for contacts with handles (best-effort, non-blocking)
 * - Tracks synced contacts in localStorage to avoid re-uploading
 * - Processes in batches to keep UI responsive
 */
export const syncContactsForUser = async (
  userId: string,
  localContacts: LocalContact[]
): Promise<{
  newContactsUploaded: number
  totalSynced: number
  hasMoreToSync: boolean
} | undefined> => {
  if (!userId || !localContacts?.length) {
    console.log('[ContactsSync] syncContactsForUser: skipping, no userId or contacts')
    return undefined
  }

  // PHASE 1: Log raw device contacts
  console.log('[ContactSync] raw device contacts =', localContacts.length)

  // Filter out unusable contacts (no email and no phone)
  const usableContacts = localContacts.filter((c) => c.email || c.phone)
  console.log('[ContactSync] after filtering unusable =', usableContacts.length, {
    filtered: localContacts.length - usableContacts.length,
  })

  // Normalize contacts and build contact IDs
  // Deduplicate by contactId (handle -> email -> phone -> id)
  const contactIdMap = new Map<string, LocalContact>()
  const normalizedContacts: NormalizedContact[] = []
  
  for (const raw of usableContacts) {
    const handle = normalizeHandle(raw.handle)
    const contactId = buildContactId({
      handle,
      email: raw.email,
      phone: raw.phone,
      id: raw.id,
    })
    
    // Deduplicate by contactId
    if (!contactIdMap.has(contactId)) {
      contactIdMap.set(contactId, raw)
      normalizedContacts.push({ contactId, raw })
    }
  }
  
  console.log('[ContactSync] after normalization + dedupe =', normalizedContacts.length, {
    deduped: usableContacts.length - normalizedContacts.length,
  })

  // PHASE 1: Log final count before upload
  console.log('[ContactSync] final normalized length =', normalizedContacts.length, {
    limit: CONTACT_SYNC_LIMIT_PER_USER,
  })

  // Upload in batches
  const result = await uploadContactsInBatches(userId, normalizedContacts, upsertContactForUser)

  // Trigger social metrics recomputation (async, non-blocking)
  recomputeSocialMetrics(userId).catch(err => {
    console.error('[ContactsSync] Failed to recompute social metrics', { uid: userId, err })
  })

  // Also recompute metrics for any claimed handles we connected to
  const claimedUserIds = new Set<string>()
  for (const normalized of normalizedContacts) {
    const handle = normalizeHandle(normalized.raw.handle)
    if (handle) {
      try {
        const dirRef = getDirectoryDocRef(handle)
        const dirDoc = await getDoc(dirRef)
        const dirData = dirDoc.data()
        if (dirData?.ownerUserId) {
          claimedUserIds.add(dirData.ownerUserId)
        }
      } catch (err) {
        // Ignore errors
      }
    }
  }

  // Recompute metrics for claimed users (async, non-blocking)
  const claimedUserIdsArray = Array.from(claimedUserIds)
  for (const claimedUserId of claimedUserIdsArray) {
    if (claimedUserId !== userId) {
      recomputeSocialMetrics(claimedUserId).catch(err => {
        console.error('[ContactsSync] Failed to recompute metrics for claimed user', {
          claimedUserId,
          err,
        })
      })
    }
  }

  return result
}


'use client'

import {
  collection,
  doc,
  setDoc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore'
import { getFirestoreDb } from '@/lib/firebase'
import type { ContactDoc, DirectoryDoc } from '@/types/contacts'

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

/**
 * Sync a batch of local contacts to Firestore.
 * - Upserts `/users/{uid}/contacts/{contactId}`
 * - Upserts `/directory/{handle}` for contacts with handles
 */
export const syncContactsForUser = async (
  userId: string,
  localContacts: Array<{
    id?: string
    name: string
    handle?: string
    phone?: string
    email?: string
    avatarUrl?: string
    tags?: string[]
  }>
) => {
  if (!userId || !localContacts?.length) return

  const db = getFirestoreDb()
  const batch = writeBatch(db)
  const now = serverTimestamp()
  const seenDirectoryHandles = new Set<string>()

  for (const raw of localContacts) {
    const handle = normalizeHandle(raw.handle)
    const contactId = buildContactId({
      handle,
      email: raw.email,
      phone: raw.phone,
      id: raw.id,
    })

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

    const contactRef = doc(getUserContactsCollectionRef(userId), contactId)
    batch.set(contactRef, contactDoc, { merge: true })

    if (handle && !seenDirectoryHandles.has(handle)) {
      seenDirectoryHandles.add(handle)
      const directoryDoc: DirectoryDoc = {
        handle,
        ownerUserId: null, // We don't know the owner yet
        displayName: raw.name || null,
        createdAt: now,
        updatedAt: now,
      }
      const dirRef = getDirectoryDocRef(handle)
      batch.set(dirRef, directoryDoc, { merge: true })
    }
  }

  await batch.commit()
}


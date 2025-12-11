'use client'

import type { User } from 'firebase/auth'
import {
  collection,
  doc,
  writeBatch,
  serverTimestamp,
  updateDoc,
  increment,
} from 'firebase/firestore'
import { getFirestoreDb } from '@/lib/firebase'

export type ContactDoc = {
  contactId: string
  email: string | null
  emails: string[]
  name: string | null
  givenName: string | null
  familyName: string | null
  phone: string | null
  phones: string[]
  hasPhoto: boolean
  photoUrl: string | null
  organization: string | null
  source: 'connections' | 'otherContacts' | 'unknown'
  googleResourceName: string | null
  importedAt: any // Firestore Timestamp
  lastUpdatedAt: any // Firestore Timestamp
  isOnPlatform: boolean
  platformUserId: string | null
  platformHandle: string | null
}

type GooglePerson = {
  resourceName?: string
  names?: { displayName?: string; givenName?: string; familyName?: string }[]
  emailAddresses?: { value?: string }[]
  phoneNumbers?: { value?: string }[]
  photos?: { url?: string; default?: boolean }[]
  organizations?: { name?: string }[]
  metadata?: { source?: { type?: string } }[]
}

/**
 * Import Google contacts for a user using the provided access token.
 * Non-fatal: errors are logged and 0 is returned.
 */
export async function importGoogleContactsForUser(params: {
  user: User
  accessToken: string
}): Promise<number> {
  const { user, accessToken } = params
  const db = getFirestoreDb()

  console.log('[Contacts] Starting Google contacts import…')

  // 1) Fetch contacts from Google People API
  const res = await fetch(
    'https://people.googleapis.com/v1/people/me/connections?' +
      new URLSearchParams({
        personFields: 'names,emailAddresses,phoneNumbers,photos,organizations,metadata',
        pageSize: '500',
      }),
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )

  if (!res.ok) {
    console.error('[Contacts] Failed to fetch Google contacts', await res.text())
    return 0
  }

  const data = (await res.json()) as { connections?: GooglePerson[] }
  const connections = data.connections ?? []

  if (!connections.length) {
    console.log('[Contacts] No Google contacts to import')
    return 0
  }

  // 2) Normalise and batch write into /users/{uid}/contacts
  const contactsCol = collection(db, 'users', user.uid, 'contacts')
  const now = serverTimestamp()
  let written = 0
  let batch = writeBatch(db)
  let batchCount = 0

  for (const person of connections) {
    const emails = (person.emailAddresses ?? [])
      .map((e) => e.value?.toLowerCase())
      .filter((e): e is string => !!e)
    const phones = (person.phoneNumbers ?? [])
      .map((p) => p.value)
      .filter((p): p is string => !!p)
    const primaryEmail = emails[0] ?? null
    const primaryPhone = phones[0] ?? null
    const nameObj = person.names?.[0]
    const displayName = nameObj?.displayName ?? null
    const orgObj = person.organizations?.[0]
    const orgName = orgObj?.name ?? null
    const photoObj = (person.photos ?? []).find((p) => !p.default) || person.photos?.[0]
    const resourceName = person.resourceName ?? null
    const googleSourceType = person.metadata?.[0]?.source?.type ?? 'UNKNOWN'
    const contactId =
      resourceName?.replace(/^people\//, '') ||
      (primaryEmail ?? primaryPhone ?? crypto.randomUUID())
    const docRef = doc(contactsCol, contactId)

    const contactDoc: ContactDoc = {
      contactId,
      email: primaryEmail,
      emails,
      name: displayName,
      givenName: nameObj?.givenName ?? null,
      familyName: nameObj?.familyName ?? null,
      phone: primaryPhone,
      phones,
      hasPhoto: !!photoObj?.url,
      photoUrl: photoObj?.url ?? null,
      organization: orgName,
      source:
        googleSourceType === 'CONTACT'
          ? 'connections'
          : googleSourceType === 'OTHER_CONTACT'
          ? 'otherContacts'
          : 'unknown',
      googleResourceName: resourceName,
      importedAt: now,
      lastUpdatedAt: now,
      isOnPlatform: false,
      platformUserId: null,
      platformHandle: null,
    }

    batch.set(docRef, contactDoc, { merge: true })
    written++
    batchCount++

    // Commit periodically to stay under batch limits
    if (batchCount >= 300) {
      await batch.commit()
      batch = writeBatch(db)
      batchCount = 0
    }
  }

  if (batchCount > 0) {
    await batch.commit()
  }

  // 3) Update social graph summary on user doc
  try {
    const userRef = doc(db, 'users', user.uid)
    await updateDoc(userRef, {
      'socialGraph.googleContactsTotal': increment(written),
      'socialGraph.googleLastSyncAt': now,
    })
  } catch (err) {
    console.warn('[Contacts] Failed to update socialGraph summary', err)
  }

  console.log(`[Contacts] Imported ${written} Google contacts for user ${user.uid}`)
  return written
}


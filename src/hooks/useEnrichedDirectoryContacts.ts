'use client'

import { useState, useEffect } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { getFirestoreDb, getFirebaseAuth } from '@/lib/firebase'
import { useAuthStore } from '@/store/auth'
import type { RankedContact } from '@/lib/contacts/rankContacts'
import type { UserDocument } from '@/lib/userDoc'

/**
 * Hook that enriches directory contacts with email/phone from user documents
 * when the user is signed in. Only fetches data for contacts with ownerUserId.
 * 
 * @param directoryContacts - Directory contacts from usePublicDirectoryContactsForUI
 * @returns Enriched contacts with email/phone when available and user is signed in
 */
export function useEnrichedDirectoryContacts(
  directoryContacts: RankedContact[]
): RankedContact[] {
  const { isAuthed } = useAuthStore()
  const [enrichedContacts, setEnrichedContacts] = useState<RankedContact[]>(directoryContacts)

  useEffect(() => {
    // Only enrich when signed in
    if (!isAuthed) {
      setEnrichedContacts(directoryContacts)
      return
    }

    // No contacts to enrich
    if (directoryContacts.length === 0) {
      setEnrichedContacts([])
      return
    }

    const enrichContacts = async () => {
      const auth = getFirebaseAuth()
      const currentUser = auth.currentUser
      
      if (!currentUser) {
        setEnrichedContacts(directoryContacts)
        return
      }

      // Get unique ownerUserIds that need enrichment
      const ownerUserIds = new Set<string>()
      directoryContacts.forEach(contact => {
        const ownerUserId = (contact.metadata as any)?.ownerUserId
        if (ownerUserId && !contact.email && !contact.phone) {
          ownerUserIds.add(ownerUserId)
        }
      })

      if (ownerUserIds.size === 0) {
        setEnrichedContacts(directoryContacts)
        return
      }

      // Fetch user documents in parallel
      const db = getFirestoreDb()
      const userDocPromises = Array.from(ownerUserIds).map(async (userId) => {
        try {
          const userRef = doc(db, 'users', userId)
          const userDoc = await getDoc(userRef)
          if (userDoc.exists()) {
            const userData = userDoc.data() as UserDocument
            return {
              userId,
              email: userData.email || null,
              phoneNumber: userData.phoneNumber || userData.phoneE164 || null,
            }
          }
          return { userId, email: null, phoneNumber: null }
        } catch (err) {
          console.error(`[useEnrichedDirectoryContacts] Failed to fetch user ${userId}`, err)
          return { userId, email: null, phoneNumber: null }
        }
      })

      const userDataMap = new Map<string, { email: string | null; phoneNumber: string | null }>()
      const results = await Promise.all(userDocPromises)
      results.forEach(result => {
        userDataMap.set(result.userId, {
          email: result.email,
          phoneNumber: result.phoneNumber,
        })
      })

      // Enrich contacts with email/phone
      const enriched = directoryContacts.map(contact => {
        const ownerUserId = (contact.metadata as any)?.ownerUserId
        if (!ownerUserId) {
          return contact
        }

        const userData = userDataMap.get(ownerUserId)
        if (!userData) {
          return contact
        }

        // Only enrich if we don't already have email/phone
        if (contact.email || contact.phone) {
          return contact
        }

        return {
          ...contact,
          email: userData.email || contact.email,
          phone: userData.phoneNumber || contact.phone,
        }
      })

      // Log one example for verification
      const exampleWithData = enriched.find(
        c => (c.metadata as any)?.ownerUserId && (c.email || c.phone)
      )
      if (exampleWithData) {
        console.log('[useEnrichedDirectoryContacts] Enriched directory contact example:', {
          handle: exampleWithData.handle,
          email: exampleWithData.email,
          phoneNumber: exampleWithData.phone,
          ownerUserId: (exampleWithData.metadata as any)?.ownerUserId,
        })
      }

      setEnrichedContacts(enriched)
    }

    void enrichContacts()
  }, [directoryContacts, isAuthed])

  return enrichedContacts
}


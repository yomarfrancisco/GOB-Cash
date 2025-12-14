'use client'

import { useState, useEffect } from 'react'
import { collection, getDocs, query, where, limit } from 'firebase/firestore'
import { getFirestoreDb, getFirebaseAuth } from '@/lib/firebase'
import { useAuthStore } from '@/store/auth'
import type { RankedContact } from '@/lib/contacts/rankContacts'
import type { DirectoryPrivateDoc } from '@/types/contacts'

/**
 * Hook that enriches public directory contacts with email/phone from directoryPrivate
 * when the user is signed in. Only fetches data for contacts with ownerUserId.
 * 
 * @param publicContacts - Public directory contacts from usePublicDirectoryContactsForUI
 * @returns Enriched contacts with email/phone when available and user is signed in
 */
export function useDirectoryPrivateContacts(
  publicContacts: RankedContact[]
): RankedContact[] {
  const { isAuthed } = useAuthStore()
  const [enrichedContacts, setEnrichedContacts] = useState<RankedContact[]>(publicContacts)

  useEffect(() => {
    // Only enrich when signed in
    if (!isAuthed) {
      setEnrichedContacts(publicContacts)
      return
    }

    // No contacts to enrich
    if (publicContacts.length === 0) {
      setEnrichedContacts([])
      return
    }

    const enrichContacts = async () => {
      const auth = getFirebaseAuth()
      const currentUser = auth.currentUser
      
      if (!currentUser) {
        setEnrichedContacts(publicContacts)
        return
      }

      // Get unique handles that need enrichment (have ownerUserId but no email/phone yet)
      const handlesToEnrich = new Set<string>()
      publicContacts.forEach(contact => {
        const ownerUserId = (contact.metadata as any)?.ownerUserId
        if (ownerUserId && !contact.email && !contact.phone) {
          handlesToEnrich.add(contact.handle)
        }
      })

      if (handlesToEnrich.size === 0) {
        setEnrichedContacts(publicContacts)
        return
      }

      // Batch fetch directoryPrivate docs for these handles
      // Firestore 'in' query supports up to 10 items, so we'll batch if needed
      const db = getFirestoreDb()
      const handleArray = Array.from(handlesToEnrich)
      const batches: string[][] = []
      
      // Split into batches of 10 (Firestore 'in' query limit)
      for (let i = 0; i < handleArray.length; i += 10) {
        batches.push(handleArray.slice(i, i + 10))
      }

      const privateDataMap = new Map<string, { email: string; phoneE164: string }>()
      
      // Fetch each batch
      for (const batch of batches) {
        try {
          const privateRef = collection(db, 'directoryPrivate')
          const q = query(
            privateRef,
            where('handle', 'in', batch),
            limit(10)
          )
          
          const snapshot = await getDocs(q)
          snapshot.forEach((doc) => {
            const data = doc.data() as DirectoryPrivateDoc
            privateDataMap.set(data.handle, {
              email: data.email,
              phoneE164: data.phoneE164,
            })
          })
        } catch (err) {
          console.error('[useDirectoryPrivateContacts] Failed to fetch batch', {
            batch,
            error: err,
          })
        }
      }

      // Enrich contacts with email/phone
      const enriched = publicContacts.map(contact => {
        const privateData = privateDataMap.get(contact.handle)
        if (!privateData) {
          return contact
        }

        // Only enrich if we don't already have email/phone
        if (contact.email || contact.phone) {
          return contact
        }

        return {
          ...contact,
          email: privateData.email,
          phone: privateData.phoneE164, // Use phoneE164 as the phone field
        }
      })

      // Log one example for verification
      const exampleWithData = enriched.find(
        c => privateDataMap.has(c.handle) && (c.email || c.phone)
      )
      if (exampleWithData) {
        console.log('[useDirectoryPrivateContacts] Enriched directory contact example:', {
          handle: exampleWithData.handle,
          email: exampleWithData.email,
          phone: exampleWithData.phone,
          ownerUserId: (exampleWithData.metadata as any)?.ownerUserId,
        })
      }

      setEnrichedContacts(enriched)
    }

    void enrichContacts()
  }, [publicContacts, isAuthed])

  return enrichedContacts
}




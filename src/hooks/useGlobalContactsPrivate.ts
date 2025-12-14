'use client'

import { useState, useEffect } from 'react'
import { collection, getDocs, query, where, limit } from 'firebase/firestore'
import { getFirestoreDb, getFirebaseAuth } from '@/lib/firebase'
import { useAuthStore } from '@/store/auth'
import type { RankedContact } from '@/lib/contacts/rankContacts'

interface GlobalContactPrivateDoc {
  handle: string
  primaryEmail: string | null
  primaryPhone: string | null
  updatedAt: any
  createdAt: any
}

/**
 * Hook that enriches global contacts public with email/phone from globalContactsPrivate
 * when the user is signed in.
 * 
 * @param publicContacts - Global contacts from useGlobalContactsPublicForUI
 * @returns Enriched contacts with email/phone when available and user is signed in
 */
export function useGlobalContactsPrivate(
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

      // Get all handles that need enrichment
      const handlesToEnrich = publicContacts
        .filter(contact => !contact.email && !contact.phone)
        .map(contact => contact.handle)

      if (handlesToEnrich.length === 0) {
        setEnrichedContacts(publicContacts)
        return
      }

      // Batch fetch globalContactsPrivate docs for these handles
      // Firestore 'in' query supports up to 10 items, so we'll batch if needed
      const db = getFirestoreDb()
      const batches: string[][] = []
      
      // Split into batches of 10 (Firestore 'in' query limit)
      for (let i = 0; i < handlesToEnrich.length; i += 10) {
        batches.push(handlesToEnrich.slice(i, i + 10))
      }

      const privateDataMap = new Map<string, { email: string | null; phone: string | null }>()
      
      // Fetch each batch
      for (const batch of batches) {
        try {
          const privateRef = collection(db, 'globalContactsPrivate')
          const q = query(
            privateRef,
            where('handle', 'in', batch),
            limit(10)
          )
          
          const snapshot = await getDocs(q)
          snapshot.forEach((doc) => {
            const data = doc.data() as GlobalContactPrivateDoc
            privateDataMap.set(data.handle, {
              email: data.primaryEmail || null,
              phone: data.primaryPhone || null,
            })
          })
        } catch (err) {
          console.error('[useGlobalContactsPrivate] Failed to fetch batch', {
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
          email: privateData.email || undefined,
          phone: privateData.phone || undefined,
        }
      })

      // Log one example for verification
      const exampleWithData = enriched.find(
        c => privateDataMap.has(c.handle) && (c.email || c.phone)
      )
      if (exampleWithData) {
        console.log('[useGlobalContactsPrivate] Enriched global contact example:', {
          handle: exampleWithData.handle,
          email: exampleWithData.email,
          phone: exampleWithData.phone,
        })
      }

      setEnrichedContacts(enriched)
    }

    void enrichContacts()
  }, [publicContacts, isAuthed])

  return enrichedContacts
}


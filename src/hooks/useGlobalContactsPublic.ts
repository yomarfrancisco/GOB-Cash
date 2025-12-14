'use client'

import { useState, useEffect } from 'react'
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore'
import { getFirestoreDb } from '@/lib/firebase'
import type { RankedContact } from '@/lib/contacts/rankContacts'

const MAX_DIRECTORY_CONTACTS = 600

interface GlobalContactPublicDoc {
  handle: string
  displayName: string | null
  sources?: string[]
  updatedAt: any
  createdAt: any
}

/**
 * Hook that reads contacts from the public Firestore `/globalContactsPublic` collection.
 * This is read-only and works pre-auth (public read allowed by Firestore rules).
 * 
 * @returns Array of contacts in RankedContact format, ready for UI display
 */
export function useGlobalContactsPublicForUI(): RankedContact[] {
  const [contacts, setContacts] = useState<RankedContact[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (typeof window === 'undefined') {
      setIsLoading(false)
      return
    }

    const loadGlobalContacts = async () => {
      try {
        const db = getFirestoreDb()
        const globalContactsRef = collection(db, 'globalContactsPublic')
        
        console.log('[useGlobalContactsPublic] Querying globalContactsPublic...')
        
        // Try ordered query first
        let snapshot
        try {
          const orderedQuery = query(
            globalContactsRef,
            orderBy('handle', 'asc'),
            limit(MAX_DIRECTORY_CONTACTS)
          )
          snapshot = await getDocs(orderedQuery)
          console.log('[useGlobalContactsPublic] Ordered query successful.')
        } catch (orderedErr: any) {
          console.warn('[useGlobalContactsPublic] Ordered query failed (likely missing index), falling back to simple query:', orderedErr.message)
          // Fallback to simple query if ordered query fails
          const simpleQuery = query(globalContactsRef, limit(MAX_DIRECTORY_CONTACTS))
          snapshot = await getDocs(simpleQuery)
          console.log('[useGlobalContactsPublic] Simple query successful.')
        }

        const mappedContacts: RankedContact[] = snapshot.docs
          .map((doc) => {
            const data = doc.data() as GlobalContactPublicDoc
            
            const handle = data.handle || ''
            const displayName = data.displayName || ''
            
            // Use displayName if available, otherwise use handle without $ prefix
            const name = displayName || handle.replace(/^\$/, '')
            
            return {
              id: `gobankless-contact-${handle}`,
              handle,
              name,
              email: undefined, // Not available in public collection
              phone: undefined, // Not available in public collection
              photoUrl: null,
              source: 'gobankless-contact',
              metadata: {
                sources: data.sources || [],
              },
            } as RankedContact
          })
          .filter((contact) => contact.handle && contact.handle.trim() !== '')

        console.debug('[useGlobalContactsPublic] Loaded global contacts', {
          source: 'globalContactsPublic',
          count: mappedContacts.length,
          isAuthed: false,
        })
        setContacts(mappedContacts)
      } catch (err) {
        console.error('[useGlobalContactsPublic] Failed to load global contacts', {
          error: err,
        })
        setContacts([])
      } finally {
        setIsLoading(false)
      }
    }
    void loadGlobalContacts()
  }, [])

  return contacts
}


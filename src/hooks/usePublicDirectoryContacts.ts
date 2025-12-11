'use client'

import { useState, useEffect } from 'react'
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore'
import { getFirestoreDb } from '@/lib/firebase'
import type { RankedContact } from '@/lib/contacts/rankContacts'
import type { DirectoryDoc } from '@/types/contacts'

const MAX_DIRECTORY_CONTACTS = 600 // Increased from 300

/**
 * Hook that reads contacts from the public Firestore `/directory` collection.
 * This is read-only and works pre-auth (public read allowed by Firestore rules).
 * 
 * @returns Array of contacts in RankedContact format, ready for UI display
 */
export function usePublicDirectoryContactsForUI(): RankedContact[] {
  const [contacts, setContacts] = useState<RankedContact[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (typeof window === 'undefined') {
      setIsLoading(false)
      return
    }

    const loadDirectoryContacts = async () => {
      try {
        const db = getFirestoreDb()
        const directoryRef = collection(db, 'directory')
        
        // Query: order by handle (always present), limit to 300
        // We'll sort by displayName in memory after mapping
        const q = query(
          directoryRef,
          orderBy('handle', 'asc'),
          limit(MAX_DIRECTORY_CONTACTS)
        )
        
        const snapshot = await getDocs(q)
        
        const mappedContacts: RankedContact[] = snapshot.docs
          .map((doc) => {
            const data = doc.data() as DirectoryDoc
            
            // Map DirectoryDoc to RankedContact format
            const handle = data.handle || ''
            const displayName = data.displayName || ''
            
            // Use displayName if available, otherwise use handle without $ prefix
            const name = displayName || handle.replace(/^\$/, '') || 'Unknown'
            
            // Compute subtitle (empty for directory entries since we don't have email/phone)
            const subtitle = ''
            
            // Use handle as the id (stable identifier)
            const id = `directory:${handle}`
            
            // Get trust score: trustGlobal (if claimed) or ghostQuality (if unclaimed)
            const trustScore = data.trustGlobal ?? data.ghostQuality ?? 0
            
            return {
              id,
              name,
              email: undefined,
              phone: undefined,
              photoUrl: undefined,
              source: 'gobankless-contact', // Tag as GoBankless contact
              qualityScore: trustScore, // Use trust score for ranking
              handle,
              subtitle,
            }
          })
          .filter((c) => c.handle) // Filter out entries without handles
          .sort((a, b) => {
            // Primary sort: by trust score (descending)
            if (b.qualityScore !== a.qualityScore) {
              return b.qualityScore - a.qualityScore
            }
            // Secondary sort: by displayName (case-insensitive) or handle if displayName is empty
            const aName = (a.name || a.handle || '').toLowerCase()
            const bName = (b.name || b.handle || '').toLowerCase()
            return aName.localeCompare(bName)
          })
        
        console.debug('[usePublicDirectoryContacts] Loaded directory contacts', {
          source: 'publicDirectory',
          count: mappedContacts.length,
          isAuthed: false,
        })
        
        setContacts(mappedContacts)
      } catch (err) {
        console.error('[usePublicDirectoryContacts] Failed to load directory contacts', {
          error: err,
        })
        setContacts([])
      } finally {
        setIsLoading(false)
      }
    }

    void loadDirectoryContacts()
  }, [])

  // Return empty array while loading to avoid flicker
  if (isLoading) {
    return []
  }

  return contacts
}


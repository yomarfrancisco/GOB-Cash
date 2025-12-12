'use client'

import { useState, useEffect } from 'react'
import { getDocs } from 'firebase/firestore'
import { getFirebaseAuth } from '@/lib/firebase'
import { getUserContactsCollectionRef } from '@/lib/contacts'
import { useAuthStore } from '@/store/auth'
import type { RankedContact } from '@/lib/contacts/rankContacts'
import type { ContactDoc } from '@/types/contacts'
import { devLog, devDebug } from '@/lib/logger'

/**
 * Hook that provides contacts for UI display, preferring Firestore over local cache.
 * 
 * - If authed: reads from `/users/{uid}/contacts` in Firestore
 * - Falls back to `rankedContacts` if Firestore is empty
 * - Returns empty list if not authed
 * 
 * @param rankedContacts - Local ranked contacts (fallback source)
 * @returns Final list of contacts ready for UI (same shape as RankedContact)
 */
export function useUserContactsForUI(rankedContacts: RankedContact[]): RankedContact[] {
  const { isAuthed } = useAuthStore()
  const [firestoreContacts, setFirestoreContacts] = useState<RankedContact[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!isAuthed) {
      setFirestoreContacts([])
      setIsLoading(false)
      return
    }

    const auth = getFirebaseAuth()
    const user = auth.currentUser
    const uid = user?.uid

    if (!uid) {
      setFirestoreContacts([])
      setIsLoading(false)
      return
    }

    // Load contacts from Firestore
    const loadFirestoreContacts = async () => {
      try {
        const contactsRef = getUserContactsCollectionRef(uid)
        const snapshot = await getDocs(contactsRef)
        
        const contacts: RankedContact[] = snapshot.docs
          .map((doc) => {
            const data = doc.data() as ContactDoc
            
            // Map ContactDoc to RankedContact format
            const displayName = data.displayName || ''
            const handle = data.handle || ''
            const email = data.primaryEmail || undefined
            const phone = data.primaryPhone || undefined
            
            // Compute handle if missing (fallback)
            const computedHandle = handle || (email ? `$${email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 18)}` : phone ? `$${phone.replace(/\s+/g, '').slice(-10)}` : '$friend')
            
            // Compute subtitle (phone · email or just one)
            let subtitle = ''
            if (phone && email) {
              subtitle = `${phone} · ${email}`
            } else if (phone) {
              subtitle = phone
            } else if (email) {
              subtitle = email
            }
            
            return {
              id: data.contactId,
              name: displayName || email || phone || 'Unknown',
              email,
              phone,
              photoUrl: undefined, // Firestore doesn't store photoUrl yet
              source: data.source || 'device',
              qualityScore: 0, // No ranking score in Firestore yet
              handle: computedHandle,
              subtitle,
            }
          })
          .sort((a, b) => {
            // Sort by displayName (case-insensitive) or handle if displayName is empty
            const aName = (a.name || a.handle || '').toLowerCase()
            const bName = (b.name || b.handle || '').toLowerCase()
            return aName.localeCompare(bName)
          })
        
        devLog('[useUserContactsForUI] Loaded Firestore contacts', {
          uid,
          count: contacts.length,
        })
        
        setFirestoreContacts(contacts)
      } catch (err) {
        console.error('[useUserContactsForUI] Failed to load Firestore contacts', {
          uid,
          error: err,
        })
        setFirestoreContacts([])
      } finally {
        setIsLoading(false)
      }
    }

    void loadFirestoreContacts()
  }, [isAuthed])

  // Return Firestore contacts if available, otherwise fall back to rankedContacts
  if (!isAuthed) {
    return []
  }

  if (isLoading) {
    // While loading, return empty to avoid flicker
    return []
  }

  if (firestoreContacts.length > 0) {
    // Firestore has contacts - use them
    return firestoreContacts
  }

  // Firestore is empty - fall back to rankedContacts
  if (rankedContacts.length > 0) {
    devDebug('[useUserContactsForUI] Firestore empty, falling back to local contacts', {
      localCount: rankedContacts.length,
    })
  }

  return rankedContacts
}


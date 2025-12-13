'use client'

import { useState, useEffect } from 'react'
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore'
import { getFirestoreDb } from '@/lib/firebase'
import type { RankedContact } from '@/lib/contacts/rankContacts'
import type { DirectoryDoc } from '@/types/contacts'
import { getContactTags } from '@/lib/contacts/contactTags'
import { tagsToMeta, buildContactSubtitle } from '@/lib/contacts/contactDescription'

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
            
            // Use handle as the id (stable identifier)
            const id = `directory:${handle}`
            
            // Get trust score: trustGlobal (if claimed) or ghostQuality (if unclaimed)
            const trustScore = data.trustGlobal ?? data.ghostQuality ?? 0
            
            // For phone inference: if we have phoneCountry, construct a placeholder phone
            // This allows getContactTags to infer region/corridor
            // Format: +[country_code]000000000 (we only need the prefix for inference)
            let inferredPhone: string | undefined = undefined
            if (data.phoneCountry) {
              // Map ISO2 to country code prefix
              const countryCodeMap: Record<string, string> = {
                'ZA': '+27',
                'MZ': '+258',
                'ZW': '+263',
                'ZM': '+260',
                'BW': '+267',
                'NA': '+264',
                'LS': '+266',
                'SZ': '+268',
                'UK': '+44',
                'GB': '+44',
                'US': '+1',
                'USA': '+1',
              }
              const prefix = countryCodeMap[data.phoneCountry] || `+${data.phoneCountry}`
              inferredPhone = prefix // Just the prefix is enough for getRegionFromPhone
            }
            
            return {
              id,
              name,
              email: undefined, // Will be enriched from user doc if ownerUserId exists and user is signed in
              phone: inferredPhone, // Pass inferred phone for region detection (will be enriched if ownerUserId exists)
              photoUrl: undefined,
              source: 'gobankless-contact', // Tag as GoBankless contact
              qualityScore: trustScore, // Use trust score for ranking
              handle,
              subtitle: '', // Will be computed by buildContactSubtitle
              // Store isAgent, phoneCountry, and ownerUserId in metadata
              metadata: {
                isAgent: data.isAgent || false,
                phoneCountry: data.phoneCountry || null,
                ownerUserId: data.ownerUserId || null, // For fetching email/phone when signed in
              },
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
        
        // Debug: log sample of directory data to see what fields are present
        const sampleWithPhoneCountry = mappedContacts
          .filter(c => (c.metadata as any)?.phoneCountry)
          .slice(0, 5)
        const sampleWithoutPhoneCountry = mappedContacts
          .filter(c => !(c.metadata as any)?.phoneCountry)
          .slice(0, 5)
        
        console.debug('[usePublicDirectoryContacts] Loaded directory contacts', {
          source: 'publicDirectory',
          count: mappedContacts.length,
          isAuthed: false,
          withPhoneCountry: sampleWithPhoneCountry.length,
          withoutPhoneCountry: sampleWithoutPhoneCountry.length,
          sampleWithPhone: sampleWithPhoneCountry.map(c => ({
            handle: c.handle,
            phoneCountry: (c.metadata as any)?.phoneCountry,
            phone: c.phone,
          })),
          sampleWithoutPhone: sampleWithoutPhoneCountry.map(c => ({
            handle: c.handle,
            phoneCountry: (c.metadata as any)?.phoneCountry,
            phone: c.phone,
          })),
        })
        
        // Compute and log subtitles for first 3 contacts (pre-auth)
        const firstThree = mappedContacts.slice(0, 3)
        const subtitleExamples = firstThree.map(contact => {
          const tags = getContactTags({
            handle: contact.handle,
            name: contact.name,
            phoneNumber: contact.phone,
            email: contact.email,
            sourceType: contact.source || null,
            phoneCountry: (contact.metadata as any)?.phoneCountry || null,
          })
          const meta = tagsToMeta(tags)
          const isAgent = (contact.metadata as any)?.isAgent || false
          const subtitle = buildContactSubtitle(meta, { isAuthenticated: false, isAgent })
          return {
            handle: contact.handle,
            phoneCountry: (contact.metadata as any)?.phoneCountry,
            tags,
            meta,
            subtitle,
          }
        })
        console.log('[usePublicDirectoryContacts] Pre-auth subtitle examples (first 3):', subtitleExamples)
        
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


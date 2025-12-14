'use client'

import { useState, useEffect } from 'react'
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore'
import { getFirestoreDb } from '@/lib/firebase'
import type { RankedContact } from '@/lib/contacts/rankContacts'
import type { PublicDirectoryDoc } from '@/types/contacts'
import { getContactTags } from '@/lib/contacts/contactTags'
import { tagsToMeta, buildContactSubtitle } from '@/lib/contacts/contactDescription'

const MAX_DIRECTORY_CONTACTS = 600

/**
 * Hook that reads contacts from the public Firestore `/publicDirectory` collection.
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
        const app = db.app
        
        // DIAGNOSTIC: Log Firebase project connection
        console.log('[usePublicDirectoryContacts] Firebase connection:', {
          projectId: app.options.projectId,
          authDomain: app.options.authDomain,
          apiKey: app.options.apiKey ? `${app.options.apiKey.substring(0, 10)}...` : 'missing',
        })
        
        const directoryRef = collection(db, 'publicDirectory')
        
        // DIAGNOSTIC: Log exact collection path
        console.log('[usePublicDirectoryContacts] Query path:', {
          collection: 'publicDirectory',
          collectionId: directoryRef.id,
          path: directoryRef.path,
        })
        
        // Try simple query first (no orderBy) to verify collection has docs
        console.log('[usePublicDirectoryContacts] Testing simple query (no orderBy)...')
        const simpleQuery = query(directoryRef, limit(10))
        const simpleSnapshot = await getDocs(simpleQuery)
        console.log('[usePublicDirectoryContacts] Simple query result:', {
          docCount: simpleSnapshot.docs.length,
          docIds: simpleSnapshot.docs.map(d => d.id).slice(0, 5),
        })
        
        if (simpleSnapshot.docs.length === 0) {
          console.warn('[usePublicDirectoryContacts] Collection is empty - no documents in publicDirectory')
          setContacts([])
          setIsLoading(false)
          return
        }
        
        // Now try the ordered query
        console.log('[usePublicDirectoryContacts] Attempting ordered query...')
        const q = query(
          directoryRef,
          orderBy('handle', 'asc'),
          limit(MAX_DIRECTORY_CONTACTS)
        )
        
        const snapshot = await getDocs(q)
        
        console.log('[usePublicDirectoryContacts] Ordered query result:', {
          docCount: snapshot.docs.length,
          docIds: snapshot.docs.map(d => d.id).slice(0, 5),
        })
        
        const mappedContacts: RankedContact[] = snapshot.docs
          .map((doc) => {
            const data = doc.data() as PublicDirectoryDoc
            
            // Map PublicDirectoryDoc to RankedContact format
            const handle = data.handle || ''
            const displayName = data.displayName || ''
            
            // DIAGNOSTIC: Log first few docs
            if (snapshot.docs.indexOf(doc) < 3) {
              console.log('[usePublicDirectoryContacts] Sample doc:', {
                docId: doc.id,
                handle,
                displayName,
                hasOwnerUserId: !!data.ownerUserId,
                phoneCountry: data.phoneCountry,
              })
            }
            
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
              email: undefined, // Public directory never has email (privacy)
              phone: inferredPhone, // Pass inferred phone for region detection
              photoUrl: data.avatarUrl || undefined,
              source: 'gobankless-contact', // Tag as GoBankless contact
              qualityScore: trustScore, // Use trust score for ranking
              handle,
              subtitle: '', // Will be computed by buildContactSubtitle
              // Store isAgent, phoneCountry, and ownerUserId in metadata
              metadata: {
                isAgent: data.isAgent || false,
                phoneCountry: data.phoneCountry || null,
                ownerUserId: data.ownerUserId || null, // For fetching private data when signed in
              },
            }
          })
          .filter((c) => c.handle) // Filter out entries without handles
        
        console.log('[usePublicDirectoryContacts] After filtering by handle:', {
          beforeFilter: snapshot.docs.length,
          afterFilter: mappedContacts.length,
          filteredOut: snapshot.docs.length - mappedContacts.length,
        })
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
        
        console.debug('[usePublicDirectoryContacts] Loaded public directory contacts', {
          source: 'publicDirectory',
          count: mappedContacts.length,
          isAuthed: false,
        })
        
        setContacts(mappedContacts)
      } catch (err: any) {
        console.error('[usePublicDirectoryContacts] Failed to load directory contacts', {
          error: err,
          errorCode: err?.code,
          errorMessage: err?.message,
          errorStack: err?.stack,
        })
        
        // If ordered query fails (likely missing index), fall back to simple query
        if (err?.code === 'failed-precondition' || err?.message?.includes('index')) {
          console.warn('[usePublicDirectoryContacts] Ordered query failed (missing index?), falling back to simple query')
          try {
            const db = getFirestoreDb()
            const directoryRef = collection(db, 'publicDirectory')
            const fallbackQuery = query(directoryRef, limit(MAX_DIRECTORY_CONTACTS))
            const fallbackSnapshot = await getDocs(fallbackQuery)
            
            console.log('[usePublicDirectoryContacts] Fallback query result:', {
              docCount: fallbackSnapshot.docs.length,
            })
            
            // Process fallback results (same mapping logic)
            const fallbackContacts: RankedContact[] = fallbackSnapshot.docs
              .map((doc) => {
                const data = doc.data() as PublicDirectoryDoc
                const handle = data.handle || ''
                const displayName = data.displayName || ''
                const name = displayName || handle.replace(/^\$/, '') || 'Unknown'
                const id = `directory:${handle}`
                const trustScore = data.trustGlobal ?? data.ghostQuality ?? 0
                
                let inferredPhone: string | undefined = undefined
                if (data.phoneCountry) {
                  const countryCodeMap: Record<string, string> = {
                    'ZA': '+27', 'MZ': '+258', 'ZW': '+263', 'ZM': '+260',
                    'BW': '+267', 'NA': '+264', 'LS': '+266', 'SZ': '+268',
                    'UK': '+44', 'GB': '+44', 'US': '+1', 'USA': '+1',
                  }
                  const prefix = countryCodeMap[data.phoneCountry] || `+${data.phoneCountry}`
                  inferredPhone = prefix
                }
                
                return {
                  id,
                  name,
                  email: undefined,
                  phone: inferredPhone,
                  photoUrl: data.avatarUrl || undefined,
                  source: 'gobankless-contact',
                  qualityScore: trustScore,
                  handle,
                  subtitle: '',
                  metadata: {
                    isAgent: data.isAgent || false,
                    phoneCountry: data.phoneCountry || null,
                    ownerUserId: data.ownerUserId || null,
                  },
                }
              })
              .filter((c) => c.handle)
              .sort((a, b) => {
                if (b.qualityScore !== a.qualityScore) {
                  return b.qualityScore - a.qualityScore
                }
                const aName = (a.name || a.handle || '').toLowerCase()
                const bName = (b.name || b.handle || '').toLowerCase()
                return aName.localeCompare(bName)
              })
            
            console.log('[usePublicDirectoryContacts] Fallback contacts processed:', {
              count: fallbackContacts.length,
            })
            
            setContacts(fallbackContacts)
            setIsLoading(false)
            return
          } catch (fallbackErr) {
            console.error('[usePublicDirectoryContacts] Fallback query also failed', fallbackErr)
          }
        }
        
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

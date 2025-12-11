import type { GoogleContact } from '@/store/contacts'

/**
 * Fetches Google Contacts from People API
 * Fetches both "My Contacts" (people/me/connections) and "Other contacts" (otherContacts)
 * Merges and deduplicates them into a single list
 * Non-blocking: returns empty array on error
 * 
 * TODO: Add pagination support if needed (currently fetches up to 2000 contacts for connections, 500 for otherContacts)
 */

// Person fields for connections.list (can include addresses)
const PEOPLE_PERSON_FIELDS_CONNECTIONS =
  'names,emailAddresses,phoneNumbers,photos,addresses,organizations,metadata'

// Person fields for otherContacts.list (DO NOT include addresses - causes 400 error)
const PEOPLE_PERSON_FIELDS_OTHER_CONTACTS =
  'names,emailAddresses,phoneNumbers,photos,metadata'

export async function fetchGoogleContacts(accessToken: string): Promise<GoogleContact[]> {
  const baseUrl = 'https://people.googleapis.com/v1'
  const commonHeaders = {
    Authorization: `Bearer ${accessToken}`,
  }

  try {
    // --- 1) My Contacts (people/me/connections) ---
    const connectionsRes = await fetch(
      `${baseUrl}/people/me/connections?personFields=${PEOPLE_PERSON_FIELDS_CONNECTIONS}&pageSize=2000`,
      { headers: commonHeaders }
    )

    if (!connectionsRes.ok) {
      if (connectionsRes.status === 403) {
        console.warn('[GoogleAuth] Permission denied for My Contacts (people/me/connections)')
      } else {
        const errorText = await connectionsRes.text()
        console.error('[GoogleAuth] Failed to fetch connections (My Contacts)', connectionsRes.status, errorText)
      }
    }

    const connectionsData = connectionsRes.ok ? await connectionsRes.json() : { connections: [] as any[] }
    const connections = (connectionsData.connections ?? []) as any[]
    
    // PHASE 1: Log raw device contacts from Google API
    console.log('[ContactSync] raw device contacts (connections) =', connections.length)

    const mappedConnections: (GoogleContact & { source: 'contacts' })[] = connections
      .filter((person: any) => person.names?.[0]) // Only include contacts with names
      .map((person: any) => {
        const name = person.names?.[0]?.displayName ?? 'Unknown'
        const email = person.emailAddresses?.[0]?.value
        const phone = person.phoneNumbers?.[0]?.value
        const photoUrl = person.photos?.[0]?.url

        return {
          id: person.resourceName ?? email ?? name ?? crypto.randomUUID(),
          name,
          email,
          phone,
          photoUrl,
          source: 'contacts' as const,
        }
      })

    // --- 2) Other contacts (people.otherContacts.list) ---
    // Wrap in try/catch to prevent 400 errors from breaking the entire fetch
    let otherContacts: any[] = []
    try {
      const otherRes = await fetch(
        `${baseUrl}/otherContacts?readMask=${PEOPLE_PERSON_FIELDS_OTHER_CONTACTS}&pageSize=500`,
        { headers: commonHeaders }
      )

      if (!otherRes.ok) {
        if (otherRes.status === 403) {
          console.warn('[GoogleAuth] Permission denied for Other contacts (otherContacts)')
        } else {
          const errorText = await otherRes.text()
          console.error('[GoogleAuth] Failed to fetch otherContacts (Other contacts)', otherRes.status, errorText)
        }
      } else {
        const otherData = await otherRes.json()
        otherContacts = (otherData.otherContacts ?? []) as any[]
      }
    } catch (err) {
      console.error('[GoogleAuth] Failed to fetch otherContacts', err)
      otherContacts = []
    }
    
    // PHASE 1: Log raw device contacts from Google API (other contacts)
    console.log('[ContactSync] raw device contacts (otherContacts) =', otherContacts.length)

    const mappedOther: (GoogleContact & { source: 'otherContacts' })[] = otherContacts
      .filter((person: any) => person.names?.[0]) // Only include contacts with names
      .map((person: any) => {
        const name = person.names?.[0]?.displayName ?? 'Unknown'
        const email = person.emailAddresses?.[0]?.value
        const phone = person.phoneNumbers?.[0]?.value
        const photoUrl = person.photos?.[0]?.url

        return {
          id: person.resourceName ?? email ?? name ?? crypto.randomUUID(),
          name,
          email,
          phone,
          photoUrl,
          source: 'otherContacts' as const,
        }
      })

    // --- 3) Merge + dedupe ---
    const combined = [...mappedConnections, ...mappedOther]

    // Simple dedupe by email if available, otherwise by id
    const byKey = new Map<string, GoogleContact & { source: string }>()
    for (const c of combined) {
      const key = (c.email ?? c.id).toLowerCase()
      if (!byKey.has(key)) {
        byKey.set(key, c)
      }
    }

    const merged = Array.from(byKey.values())
    
    // PHASE 1: Log after deduplication
    console.log('[ContactSync] after deduplication (by email/id) =', merged.length, {
      connections: mappedConnections.length,
      otherContacts: mappedOther.length,
      deduped: combined.length - merged.length,
    })

    // --- 4) Console logging for eyeballing ---
    console.group('[GoogleAuth] Contacts from Google People API')
    console.log('[Contacts] Raw connections (My Contacts)', connections.length, connections)
    console.log('[Contacts] Raw otherContacts (Other contacts)', otherContacts.length, otherContacts)
    console.log('[Contacts] Mapped connections', mappedConnections.length, mappedConnections)
    console.log('[Contacts] Mapped otherContacts', mappedOther.length, mappedOther)
    console.log('[Contacts] Merged & deduped contacts', merged.length, merged)
    console.groupEnd()

    // Strip the internal `source` before returning (store expects plain GoogleContact)
    const result: GoogleContact[] = merged.map(({ source, ...rest }) => rest)
    
    // PHASE 1: Log final result from fetchGoogleContacts
    console.log('[ContactSync] fetchGoogleContacts returning =', result.length)

    return result
  } catch (error) {
    console.error('[GoogleAuth] Error fetching Google contacts:', error)
    return [] // Non-blocking - return empty array
  }
}


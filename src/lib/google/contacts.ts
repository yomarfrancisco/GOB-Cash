import type { GoogleContact } from '@/store/contacts'

/**
 * Fetches Google Contacts from People API
 * Fetches both "My Contacts" (people/me/connections) and "Other contacts" (otherContacts)
 * Merges and deduplicates them into a single list
 * Non-blocking: returns empty array on error
 * 
 * TODO: Add pagination support if needed (currently fetches up to 2000 contacts for connections, 500 for otherContacts)
 */
export async function fetchGoogleContacts(accessToken: string): Promise<GoogleContact[]> {
  const baseUrl = 'https://people.googleapis.com/v1'
  const commonHeaders = {
    Authorization: `Bearer ${accessToken}`,
  }

  try {
    // --- 1) My Contacts (people/me/connections) ---
    const connectionsRes = await fetch(
      `${baseUrl}/people/me/connections?personFields=names,emailAddresses,phoneNumbers,photos&pageSize=2000`,
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
    const otherRes = await fetch(
      `${baseUrl}/otherContacts?readMask=names,emailAddresses,phoneNumbers,photos&pageSize=500`,
      { headers: commonHeaders }
    )

    if (!otherRes.ok) {
      if (otherRes.status === 403) {
        console.warn('[GoogleAuth] Permission denied for Other contacts (otherContacts)')
      } else {
        const errorText = await otherRes.text()
        console.error('[GoogleAuth] Failed to fetch otherContacts (Other contacts)', otherRes.status, errorText)
      }
    }

    const otherData = otherRes.ok ? await otherRes.json() : { otherContacts: [] as any[] }
    const otherContacts = (otherData.otherContacts ?? []) as any[]

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

    // --- 4) Console logging for eyeballing ---
    console.group('[GoogleAuth] Contacts from Google People API')
    console.log('[Contacts] Raw connections (My Contacts)', connections.length, connections)
    console.log('[Contacts] Raw otherContacts (Other contacts)', otherContacts.length, otherContacts)
    console.log('[Contacts] Mapped connections', mappedConnections.length, mappedConnections)
    console.log('[Contacts] Mapped otherContacts', mappedOther.length, mappedOther)
    console.log('[Contacts] Merged & deduped contacts', merged.length, merged)
    console.groupEnd()

    // Preserve source field in returned contacts (store now supports it)
    const result: GoogleContact[] = merged

    return result
  } catch (error) {
    console.error('[GoogleAuth] Error fetching Google contacts:', error)
    return [] // Non-blocking - return empty array
  }
}


import type { GoogleContact } from '@/store/contacts'

/**
 * Fetches Google Contacts from People API
 * Non-blocking: returns empty array on error
 */
export async function fetchGoogleContacts(accessToken: string): Promise<GoogleContact[]> {
  try {
    const response = await fetch(
      'https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,phoneNumbers,photos',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )

    if (!response.ok) {
      if (response.status === 403) {
        // Permission denied - return empty array (non-blocking)
        console.warn('Google Contacts permission denied')
        return []
      }
      const errorText = await response.text()
      console.error('Failed to fetch Google contacts:', response.status, errorText)
      return []
    }

    const data = await response.json()

    // Handle empty connections
    if (!data.connections || data.connections.length === 0) {
      return []
    }

    // Map People API response to GoogleContact format
    return data.connections
      .filter((person: any) => person.names?.[0]) // Only include contacts with names
      .map((person: any) => ({
        id: person.resourceName || crypto.randomUUID(),
        name: person.names?.[0]?.displayName || 'Unknown',
        email: person.emailAddresses?.[0]?.value,
        phone: person.phoneNumbers?.[0]?.value,
        photoUrl: person.photos?.[0]?.url,
      }))
  } catch (error) {
    console.error('Error fetching Google contacts:', error)
    return [] // Non-blocking - return empty array
  }
}


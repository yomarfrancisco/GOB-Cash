import type { RankedContact } from './rankContacts'

export type ContactSection = {
  letter: string // 'A'...'Z' or '#'
  contacts: RankedContact[]
}

/**
 * Get display name for a contact (for sorting/grouping)
 */
export function getDisplayName(contact: RankedContact): string {
  // Prefer handle or name we're already rendering in the list
  return contact.name || contact.handle || contact.email || ''
}

/**
 * Group contacts by first letter (A-Z or # for non-alpha)
 */
export function groupByFirstLetter(list: RankedContact[]): ContactSection[] {
  const map = new Map<string, RankedContact[]>()

  for (const c of list) {
    const name = getDisplayName(c).trim()
    if (!name) continue

    const first = name.charAt(0).toUpperCase()
    const key = first >= 'A' && first <= 'Z' ? first : '#'

    if (!map.has(key)) {
      map.set(key, [])
    }
    map.get(key)!.push(c)
  }

  // Sort letters: A-Z first, then #
  const letters = Array.from(map.keys()).sort((a, b) => {
    if (a === '#') return 1
    if (b === '#') return -1
    return a.localeCompare(b)
  })

  return letters.map((letter) => ({
    letter,
    contacts: map.get(letter)!.sort((a, b) =>
      getDisplayName(a).localeCompare(getDisplayName(b))
    ),
  }))
}


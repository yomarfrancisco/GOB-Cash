/**
 * Contact Description Helper
 * Converts contact tags into user-friendly subtitle strings
 * with different wording for authenticated vs unauthenticated users
 */

import type { ContactTags } from './contactTags'

export interface ContactDescriptionOpts {
  isAuthenticated: boolean
}

const regionLabel = (region: ContactTags['region']): string => {
  switch (region) {
    case 'mozambique':
      return 'Mozambique'
    case 'south_africa':
      return 'South Africa'
    case 'sadc':
      return 'SADC region'
    case 'uk':
      return 'United Kingdom'
    case 'usa':
      return 'United States'
    case 'intl':
      return 'global'
    case 'unknown':
    default:
      return 'the GoBankless network'
  }
}

const corridorLabel = (corridor: ContactTags['corridor']): string | null => {
  switch (corridor) {
    case 'sadc_remittance_corridor':
      return 'SADC cash corridor'
    case 'intl_remittance_corridor':
      return 'international cash corridor'
    case 'local_only':
      return 'local cash network'
    default:
      return null
  }
}

const timezoneLabel = (tz: ContactTags['timezone']): string | null => {
  switch (tz) {
    case 'gmt_plus_2':
      return 'GMT+2'
    case 'uk_eu_time':
      return 'UK/EU time'
    case 'us_time':
      return 'US time'
    default:
      return null
  }
}

export const getContactDescription = (
  tags: ContactTags,
  opts: ContactDescriptionOpts
): string => {
  const region = regionLabel(tags.region)
  const corridor = corridorLabel(tags.corridor)
  const tz = timezoneLabel(tags.timezone)

  const parts: string[] = []

  if (opts.isAuthenticated) {
    // Authenticated: can refer to "your network", but no emails/phones.
    if (corridor) {
      parts.push(`In your ${corridor}`)
    } else {
      parts.push('In your GoBankless cash network')
    }
  } else {
    // Public / unauthenticated: no "connected to you".
    if (corridor) {
      parts.push(`GoBankless contact in the ${corridor}`)
    } else {
      parts.push('GoBankless cash contact')
    }
  }

  // Add region + timezone as lightweight context
  const regionTzParts: string[] = []

  if (tags.region !== 'unknown') regionTzParts.push(region)
  if (tz) regionTzParts.push(tz)

  if (regionTzParts.length > 0) {
    parts.push(regionTzParts.join(' • '))
  }

  return parts.join(' • ')
}

// Short subtitle helper - only high-signal info (corridor, country, timezone)
export type CorridorType = 'sadc' | 'international' | 'local' | null

export interface ContactMeta {
  corridor?: CorridorType // 'sadc' | 'international' | 'local'
  countryName?: string // "South Africa", "Mozambique", "USA", etc.
  timeZoneLabel?: string // "GMT+2", "GMT-5", etc.
}

export function buildContactSubtitle(
  meta: ContactMeta,
  opts: { isAuthenticated: boolean }
): string {
  const parts: string[] = []

  // 1) Corridor label – no "GoBankless contact", no "In your …"
  if (meta.corridor === 'sadc') {
    parts.push('SADC cash corridor')
  } else if (meta.corridor === 'international') {
    parts.push('International cash corridor')
  } else if (meta.corridor === 'local') {
    parts.push('Local cash corridor')
  }

  // 2) Country (only if we have it and it's not already implied)
  if (meta.countryName && !parts.some((p) => p.includes(meta.countryName!))) {
    parts.push(meta.countryName)
  }

  // 3) Timezone
  if (meta.timeZoneLabel) {
    parts.push(meta.timeZoneLabel) // e.g. "GMT+2"
  }

  // 4) Fallbacks if we really have no signal
  if (parts.length === 0) {
    // Authenticated can be slightly more personal, but still short.
    parts.push(opts.isAuthenticated ? 'GoBankless contact' : 'Cash corridor contact')
  }

  // 5) Join + hard length cap to keep to a single readable line
  let subtitle = parts.join(' • ')
  const MAX_LEN = 55
  if (subtitle.length > MAX_LEN) {
    subtitle = subtitle.slice(0, MAX_LEN - 1) + '…'
  }

  return subtitle
}

// Helper to convert ContactTags to ContactMeta for buildContactSubtitle
export function tagsToMeta(tags: ContactTags): ContactMeta {
  let corridor: CorridorType = null
  if (tags.corridor === 'sadc_remittance_corridor') {
    corridor = 'sadc'
  } else if (tags.corridor === 'intl_remittance_corridor') {
    corridor = 'international'
  } else if (tags.corridor === 'local_only') {
    corridor = 'local'
  }

  let countryName: string | undefined
  if (tags.region === 'mozambique') {
    countryName = 'Mozambique'
  } else if (tags.region === 'south_africa') {
    countryName = 'South Africa'
  } else if (tags.region === 'sadc') {
    countryName = 'SADC region'
  } else if (tags.region === 'uk') {
    countryName = 'United Kingdom'
  } else if (tags.region === 'usa') {
    countryName = 'United States'
  }

  let timeZoneLabel: string | undefined
  if (tags.timezone === 'gmt_plus_2') {
    timeZoneLabel = 'GMT+2'
  } else if (tags.timezone === 'uk_eu_time') {
    timeZoneLabel = 'GMT+1'
  } else if (tags.timezone === 'us_time') {
    timeZoneLabel = 'GMT-5'
  }

  return {
    corridor,
    countryName,
    timeZoneLabel,
  }
}


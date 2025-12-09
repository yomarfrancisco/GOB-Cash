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


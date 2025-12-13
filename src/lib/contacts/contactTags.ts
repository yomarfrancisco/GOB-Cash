/**
 * Contact Tag Engine
 * Console-only diagnostic tool for enriching contacts with non-sensitive tags
 * (region, source, corridor, timezone) based on available contact data.
 */

export type ContactRegionTag =
  | 'mozambique'
  | 'south_africa'
  | 'sadc'
  | 'uk'
  | 'usa'
  | 'intl'
  | 'unknown'

export type ContactSourceTag =
  | 'phone_contact'
  | 'whatsapp_contact'
  | 'google_contact'
  | 'imported'
  | 'unknown'

export type ContactCorridorTag =
  | 'sadc_remittance_corridor'
  | 'intl_remittance_corridor'
  | 'local_only'
  | 'unknown'

export type ContactTimeZoneTag =
  | 'gmt_plus_2'
  | 'uk_eu_time'
  | 'us_time'
  | 'unknown'

export interface ContactTags {
  region: ContactRegionTag
  source: ContactSourceTag
  corridor: ContactCorridorTag
  timezone: ContactTimeZoneTag
}

// Minimal contact interface for tagging
export interface RankedContactMinimal {
  handle?: string | null
  name?: string | null
  phoneNumber?: string | null
  email?: string | null
  sourceType?: string | null // e.g. 'phone', 'whatsapp', 'google', etc.
  phoneCountry?: string | null // ISO2 country code (e.g., 'ZA', 'MZ')
}

/**
 * Infer region from ISO2 country code (e.g., 'ZA', 'MZ', 'ZW')
 */
const getRegionFromCountryCode = (countryCode?: string | null): ContactRegionTag => {
  if (!countryCode) return 'unknown'

  const code = countryCode.toUpperCase()

  // Mozambique
  if (code === 'MZ') return 'mozambique'
  
  // South Africa
  if (code === 'ZA') return 'south_africa'
  
  // SADC countries
  if (['ZW', 'ZM', 'BW', 'NA', 'LS', 'SZ'].includes(code)) {
    return 'sadc'
  }

  // UK
  if (code === 'UK' || code === 'GB') return 'uk'
  
  // USA
  if (code === 'US' || code === 'USA') return 'usa'

  return 'intl'
}

const getRegionFromPhone = (phoneNumber?: string | null): ContactRegionTag => {
  if (!phoneNumber) return 'unknown'

  const normalized = phoneNumber.replace(/\s+/g, '')

  // Basic prefix mapping – keep it small and explicit for now
  if (normalized.startsWith('+258')) return 'mozambique'
  if (normalized.startsWith('+27')) return 'south_africa'

  // SADC-ish examples
  if (
    normalized.startsWith('+26') && // e.g. +260, +263, etc.
    !normalized.startsWith('+268') // avoid misclassifying Eswatini if you want
  ) {
    return 'sadc'
  }

  if (normalized.startsWith('+44')) return 'uk'
  if (normalized.startsWith('+1')) return 'usa'

  return 'intl'
}

const getSourceFromMetadata = (sourceType?: string | null): ContactSourceTag => {
  if (!sourceType) return 'unknown'

  const s = sourceType.toLowerCase()

  if (s.includes('whatsapp')) return 'whatsapp_contact'
  if (s.includes('phone')) return 'phone_contact'
  if (s.includes('google')) return 'google_contact'
  if (s.includes('import')) return 'imported'

  return 'unknown'
}

const getCorridorFromRegion = (region: ContactRegionTag): ContactCorridorTag => {
  if (region === 'mozambique' || region === 'south_africa' || region === 'sadc') {
    return 'sadc_remittance_corridor'
  }

  if (region === 'uk' || region === 'usa' || region === 'intl') {
    return 'intl_remittance_corridor'
  }

  return 'unknown'
}

const getTimezoneFromRegion = (region: ContactRegionTag): ContactTimeZoneTag => {
  if (region === 'mozambique' || region === 'south_africa' || region === 'sadc') {
    return 'gmt_plus_2'
  }

  if (region === 'uk') return 'uk_eu_time'
  if (region === 'usa') return 'us_time'
  if (region === 'intl') return 'unknown'

  return 'unknown'
}

export const getContactTags = (contact: RankedContactMinimal): ContactTags => {
  // Prefer phoneCountry (ISO2) over phoneNumber for region inference
  // phoneCountry is more direct and reliable when available
  const region = contact.phoneCountry 
    ? getRegionFromCountryCode(contact.phoneCountry)
    : getRegionFromPhone(contact.phoneNumber)
  const source = getSourceFromMetadata(contact.sourceType)
  const corridor = getCorridorFromRegion(region)
  const timezone = getTimezoneFromRegion(region)

  return { region, source, corridor, timezone }
}


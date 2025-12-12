/**
 * SADC Phone Number Resolver
 * 
 * Resolves raw phone input to E.164 format with country detection and confidence scoring.
 * Supports all SADC countries with heuristics, geo, timezone, locale, and IP signals.
 */

export type CountryISO2 = 
  | 'ZA' // South Africa
  | 'MZ' // Mozambique
  | 'ZW' // Zimbabwe
  | 'ZM' // Zambia
  | 'BW' // Botswana
  | 'NA' // Namibia
  | 'LS' // Lesotho
  | 'SZ' // Eswatini
  | 'AO' // Angola
  | 'MW' // Malawi
  | 'TZ' // Tanzania
  | 'CD' // DRC
  | 'MG' // Madagascar
  | 'MU' // Mauritius
  | 'SC' // Seychelles

export interface ResolverSignals {
  rawInput: string
  digitsOnly: string
  geo?: { lat: number; lng: number; accuracyM?: number } | null
  timezone?: string | null
  locale?: string | null
  ipCountry?: CountryISO2 | null
}

export interface CountryCandidate {
  iso2: CountryISO2
  countryCode: string // "+27"
  e164: string
  score: number // 0..1
  reasons: string[]
}

export interface ResolveResult {
  best: CountryCandidate | null
  candidates: CountryCandidate[]
  confidence: number // best.score
  needsUserConfirm: boolean
}

// SADC country definitions
export const SADC_COUNTRIES: Record<CountryISO2, {
  code: string
  name: string
  length: number | number[] // Expected digit length after country code
  prefixes?: string[] // Common prefixes (without country code)
  bbox?: { minLat: number; minLng: number; maxLat: number; maxLng: number } // Approximate bounding box
}> = {
  ZA: { code: '+27', name: 'South Africa', length: 9, prefixes: ['82', '83', '84', '72', '73', '74', '76', '78', '79', '60', '61', '62', '63', '64', '65', '66', '67', '68', '69'], bbox: { minLat: -35, minLng: 16, maxLat: -22, maxLng: 33 } },
  MZ: { code: '+258', name: 'Mozambique', length: 9, prefixes: ['82', '83', '84', '85', '86', '87'], bbox: { minLat: -27, minLng: 30, maxLat: -10, maxLng: 41 } },
  ZW: { code: '+263', name: 'Zimbabwe', length: 9, prefixes: ['71', '73', '77', '78'], bbox: { minLat: -23, minLng: 25, maxLat: -15, maxLng: 33 } },
  ZM: { code: '+260', name: 'Zambia', length: 9, prefixes: ['76', '77', '96', '97'], bbox: { minLat: -18, minLng: 22, maxLat: -8, maxLng: 34 } },
  BW: { code: '+267', name: 'Botswana', length: 8, prefixes: ['71', '72', '73', '74', '75', '76', '77'], bbox: { minLat: -27, minLng: 19, maxLat: -17, maxLng: 30 } },
  NA: { code: '+264', name: 'Namibia', length: 9, prefixes: ['81', '85'], bbox: { minLat: -28, minLng: 11, maxLat: -16, maxLng: 26 } },
  LS: { code: '+266', name: 'Lesotho', length: 8, prefixes: ['58', '59'], bbox: { minLat: -30, minLng: 27, maxLat: -28, maxLng: 30 } },
  SZ: { code: '+268', name: 'Eswatini', length: 8, prefixes: ['76', '77'], bbox: { minLat: -27, minLng: 30, maxLat: -25, maxLng: 32 } },
  AO: { code: '+244', name: 'Angola', length: 9, prefixes: ['923', '924', '925', '926'], bbox: { minLat: -18, minLng: 11, maxLat: -4, maxLng: 24 } },
  MW: { code: '+265', name: 'Malawi', length: 9, prefixes: ['88', '99'], bbox: { minLat: -17, minLng: 32, maxLat: -9, maxLng: 36 } },
  TZ: { code: '+255', name: 'Tanzania', length: 9, prefixes: ['74', '75', '76', '78'], bbox: { minLat: -12, minLng: 29, maxLat: -1, maxLng: 41 } },
  CD: { code: '+243', name: 'DRC', length: 9, prefixes: ['81', '82', '84', '85', '89', '90', '91', '97', '99'], bbox: { minLat: -14, minLng: 12, maxLat: 5, maxLng: 32 } },
  MG: { code: '+261', name: 'Madagascar', length: 9, prefixes: ['32', '33', '34'], bbox: { minLat: -26, minLng: 43, maxLat: -11, maxLng: 51 } },
  MU: { code: '+230', name: 'Mauritius', length: 8, prefixes: ['5'], bbox: { minLat: -21, minLng: 57, maxLat: -19, maxLng: 58 } },
  SC: { code: '+248', name: 'Seychelles', length: 7, prefixes: ['2'], bbox: { minLat: -10, minLng: 46, maxLat: -4, maxLng: 56 } },
}

/**
 * Normalize raw phone input to digits only
 */
export function normalizeDigits(raw: string): string {
  return raw.replace(/[^\d+]/g, '').replace(/^\+/, '')
}

/**
 * Convert digits to E.164 format for a given country
 */
export function toE164(iso2: CountryISO2, digitsOnly: string): string {
  const country = SADC_COUNTRIES[iso2]
  if (!country) {
    throw new Error(`Unknown country: ${iso2}`)
  }

  let cleaned = digitsOnly

  // Handle ZA trunk "0" stripping
  if (iso2 === 'ZA' && cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1)
  }

  // Handle other countries with leading 0
  if (cleaned.startsWith('0') && cleaned.length > 1) {
    // Check if removing 0 gives us expected length
    const withoutZero = cleaned.substring(1)
    const expectedLength = Array.isArray(country.length) 
      ? country.length 
      : [country.length]
    
    if (expectedLength.some(len => withoutZero.length === len)) {
      cleaned = withoutZero
    }
  }

  // Ensure we have the right length
  const expectedLength = Array.isArray(country.length) 
    ? country.length[0] 
    : country.length

  if (cleaned.length !== expectedLength) {
    // Try to pad or trim if close
    if (cleaned.length === expectedLength + 1 && cleaned.startsWith('0')) {
      cleaned = cleaned.substring(1)
    }
  }

  return `${country.code}${cleaned}`
}

/**
 * Check if geo coordinates are within country bounding box
 */
function isGeoInCountry(geo: { lat: number; lng: number }, iso2: CountryISO2): boolean {
  const country = SADC_COUNTRIES[iso2]
  if (!country?.bbox) return false

  const { minLat, minLng, maxLat, maxLng } = country.bbox
  return geo.lat >= minLat && geo.lat <= maxLat && geo.lng >= minLng && geo.lng <= maxLng
}

/**
 * Score a country candidate based on signals
 */
function scoreCountry(
  iso2: CountryISO2,
  digitsOnly: string,
  signals: ResolverSignals
): { score: number; reasons: string[] } {
  const country = SADC_COUNTRIES[iso2]
  if (!country) {
    return { score: 0, reasons: [] }
  }

  let score = 0
  const reasons: string[] = []

  // Base digit heuristics
  const expectedLength = Array.isArray(country.length) 
    ? country.length 
    : [country.length]
  
  const actualLength = digitsOnly.startsWith('0') 
    ? digitsOnly.length - 1 
    : digitsOnly.length

  if (expectedLength.includes(actualLength)) {
    score += 0.4
    reasons.push(`length matches (${actualLength})`)
  } else {
    // Partial credit for close length
    const minLength = Math.min(...expectedLength)
    const maxLength = Math.max(...expectedLength)
    if (actualLength >= minLength - 1 && actualLength <= maxLength + 1) {
      score += 0.2
      reasons.push(`length close (${actualLength})`)
    }
  }

  // Prefix matching
  if (country.prefixes && country.prefixes.length > 0) {
    const prefix = digitsOnly.startsWith('0') 
      ? digitsOnly.substring(1, 3) 
      : digitsOnly.substring(0, 2)
    
    if (country.prefixes.some(p => prefix.startsWith(p))) {
      score += 0.2
      reasons.push(`prefix matches (${prefix})`)
    }
  }

  // Geo signal
  if (signals.geo) {
    if (isGeoInCountry(signals.geo, iso2)) {
      score += 0.2
      reasons.push('geo in country')
    }
  }

  // Timezone signal
  if (signals.timezone) {
    // Basic timezone to country mapping (simplified)
    const tzCountryMap: Record<string, CountryISO2[]> = {
      'Africa/Johannesburg': ['ZA', 'LS', 'SZ'],
      'Africa/Maputo': ['MZ'],
      'Africa/Harare': ['ZW'],
      'Africa/Lusaka': ['ZM'],
      'Africa/Gaborone': ['BW'],
      'Africa/Windhoek': ['NA'],
      'Africa/Blantyre': ['MW'],
      'Africa/Dar_es_Salaam': ['TZ'],
      'Africa/Kinshasa': ['CD'],
      'Africa/Antananarivo': ['MG'],
      'Indian/Mauritius': ['MU'],
      'Indian/Mahe': ['SC'],
    }

    const matchingCountries = tzCountryMap[signals.timezone] || []
    if (matchingCountries.includes(iso2)) {
      score += 0.15
      reasons.push('timezone matches')
    }
  }

  // Locale signal
  if (signals.locale) {
    const localeCountryMap: Record<string, CountryISO2[]> = {
      'en-ZA': ['ZA'],
      'pt-MZ': ['MZ'],
      'en-ZW': ['ZW'],
      'en-ZM': ['ZM'],
      'en-BW': ['BW'],
      'en-NA': ['NA'],
      'en-LS': ['LS'],
      'en-SZ': ['SZ'],
      'pt-AO': ['AO'],
      'en-MW': ['MW'],
      'sw-TZ': ['TZ'],
      'fr-CD': ['CD'],
      'mg-MG': ['MG'],
      'en-MU': ['MU'],
      'en-SC': ['SC'],
    }

    const matchingCountries = localeCountryMap[signals.locale] || []
    if (matchingCountries.includes(iso2)) {
      score += 0.05
      reasons.push('locale matches')
    }
  }

  // IP country signal
  if (signals.ipCountry === iso2) {
    score += 0.05
    reasons.push('IP country matches')
  }

  // Normalize to 0..1
  score = Math.min(1, Math.max(0, score))

  return { score, reasons }
}

/**
 * Resolve phone number to E.164 with country detection
 */
export function resolveSadcPhone(signals: ResolverSignals): ResolveResult {
  const digitsOnly = normalizeDigits(signals.rawInput)
  
  if (!digitsOnly || digitsOnly.length < 7) {
    return {
      best: null,
      candidates: [],
      confidence: 0,
      needsUserConfirm: true,
    }
  }

  // Score all SADC countries
  const candidates: CountryCandidate[] = Object.keys(SADC_COUNTRIES).map((iso2) => {
    const country = SADC_COUNTRIES[iso2 as CountryISO2]
    const { score, reasons } = scoreCountry(iso2 as CountryISO2, digitsOnly, signals)
    
    let e164: string
    try {
      e164 = toE164(iso2 as CountryISO2, digitsOnly)
    } catch {
      e164 = `${country.code}${digitsOnly}`
    }

    return {
      iso2: iso2 as CountryISO2,
      countryCode: country.code,
      e164,
      score,
      reasons,
    }
  })

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score)

  // Get top 5
  const topCandidates = candidates.slice(0, 5)
  const best = topCandidates[0] || null

  // Determine if user confirmation is needed
  const needsUserConfirm = !best || best.score < 0.75 || topCandidates.length > 1 && topCandidates[1].score > best.score * 0.9

  return {
    best,
    candidates: topCandidates,
    confidence: best?.score || 0,
    needsUserConfirm,
  }
}


/**
 * Trust Scoring Module
 * 
 * Computes trust level and flags based on phone resolution signals and verification behavior.
 */

export interface TrustInputs {
  countryConfidence: number | null
  geoPresent: boolean
  geoCountryMatch: boolean | null // null if geo not available
  otpRetryCount: number // Number of OTP attempts before success
  ipCountryMatch: boolean | null // null if IP country not available
}

export interface TrustResult {
  trustLevel: number // 0-100
  flags: string[] // Array of trust flags (e.g., 'low-confidence', 'geo-mismatch')
}

/**
 * Check if geo coordinates match a country (simplified check using bbox)
 */
export function checkGeoCountryMatch(
  geo: { lat: number; lng: number },
  countryISO2: string
): boolean {
  // Use bounding boxes from resolver
  const { SADC_COUNTRIES } = require('@/lib/phone/resolveSadcPhone')
  const country = SADC_COUNTRIES[countryISO2 as keyof typeof SADC_COUNTRIES]
  
  if (!country?.bbox) return false
  
  const { minLat, minLng, maxLat, maxLng } = country.bbox
  return geo.lat >= minLat && geo.lat <= maxLat && geo.lng >= minLng && geo.lng <= maxLng
}

/**
 * Compute trust level and flags from inputs
 */
export function computeTrust(inputs: TrustInputs): TrustResult {
  let trustLevel = 50 // Base trust level
  const flags: string[] = []

  // Country confidence scoring
  if (inputs.countryConfidence !== null) {
    if (inputs.countryConfidence >= 0.9) {
      trustLevel += 20
    } else if (inputs.countryConfidence >= 0.75) {
      trustLevel += 10
    } else if (inputs.countryConfidence >= 0.5) {
      trustLevel += 5
    } else {
      trustLevel -= 10
      flags.push('low-confidence')
    }
  } else {
    trustLevel -= 15
    flags.push('no-country-resolution')
  }

  // Geo presence and match
  if (inputs.geoPresent) {
    trustLevel += 10
    if (inputs.geoCountryMatch === true) {
      trustLevel += 10
    } else if (inputs.geoCountryMatch === false) {
      trustLevel -= 15
      flags.push('geo-mismatch')
    }
  } else {
    // No geo - slight penalty but not severe
    trustLevel -= 5
  }

  // OTP retry count (fewer retries = higher trust)
  if (inputs.otpRetryCount === 0) {
    // First attempt succeeded - high trust
    trustLevel += 10
  } else if (inputs.otpRetryCount === 1) {
    // Second attempt succeeded - normal
    trustLevel += 5
  } else if (inputs.otpRetryCount >= 2) {
    // Multiple retries - lower trust
    trustLevel -= 10
    flags.push('multiple-otp-retries')
  }

  // IP country match
  if (inputs.ipCountryMatch === true) {
    trustLevel += 5
  } else if (inputs.ipCountryMatch === false) {
    trustLevel -= 10
    flags.push('ip-mismatch')
  }

  // Clamp to 0-100
  trustLevel = Math.max(0, Math.min(100, trustLevel))

  return {
    trustLevel: Math.round(trustLevel),
    flags,
  }
}


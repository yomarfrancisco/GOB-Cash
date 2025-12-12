/**
 * Get default country for social graph / directory filtering
 * 
 * Uses phone resolution metadata if available, falls back to geo, then global.
 */

import type { CountryISO2 } from './resolveSadcPhone'

export interface DefaultCountryInputs {
  phoneCountry?: string | null // ISO2
  phoneCountryConfidence?: number | null
  geoAtSignup?: { lat: number; lng: number } | null
}

/**
 * Get default country for filtering agents/directory
 */
export function getDefaultCountry(inputs: DefaultCountryInputs): CountryISO2 | null {
  // Priority 1: Phone country if confidence is high
  const conf = inputs.phoneCountryConfidence ?? 0
  if (inputs.phoneCountry && conf >= 0.75) {
    return inputs.phoneCountry as CountryISO2
  }

  // Priority 2: Geo country if available
  if (inputs.geoAtSignup) {
    const { resolveSadcPhone } = require('./resolveSadcPhone')
    const result = resolveSadcPhone({
      rawInput: '',
      digitsOnly: '',
      geo: inputs.geoAtSignup,
      timezone: null,
      locale: null,
      ipCountry: null,
    })
    
    if (result.best) {
      return result.best.iso2
    }
  }

  // Priority 3: Global (null = no filter)
  return null
}


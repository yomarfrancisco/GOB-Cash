/**
 * Extract ISO2 country code from phone number
 * Returns ISO2 code (e.g., 'ZA', 'MZ') or null if cannot be determined
 */

export function extractPhoneCountry(phoneNumber: string | null | undefined): string | null {
  if (!phoneNumber) return null

  const normalized = phoneNumber.replace(/\s+/g, '').replace(/-/g, '')

  // Map country code prefixes to ISO2 codes
  // Common SADC and international codes
  if (normalized.startsWith('+27')) return 'ZA' // South Africa
  if (normalized.startsWith('+258')) return 'MZ' // Mozambique
  if (normalized.startsWith('+263')) return 'ZW' // Zimbabwe
  if (normalized.startsWith('+260')) return 'ZM' // Zambia
  if (normalized.startsWith('+267')) return 'BW' // Botswana
  if (normalized.startsWith('+264')) return 'NA' // Namibia
  if (normalized.startsWith('+266')) return 'LS' // Lesotho
  if (normalized.startsWith('+268')) return 'SZ' // Eswatini
  if (normalized.startsWith('+44')) return 'GB' // United Kingdom
  if (normalized.startsWith('+1')) return 'US' // United States / Canada

  // If no match, return null
  return null
}


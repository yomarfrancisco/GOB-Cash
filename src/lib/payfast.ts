/**
 * PayFast utility functions
 * 
 * Known-good signature implementation matching production PayFast spec:
 * - Build params using URLSearchParams in insertion order
 * - Create signature from params.toString() (spaces → +)
 * - If passphrase exists: append passphrase before hashing, compute MD5, then remove passphrase from final request
 * - Add signature only after hashing
 * - Amount must be toFixed(2)
 * - No alphabetical sorting, no encodeURIComponent in create flow
 */

import crypto from 'crypto'

/**
 * Get PayFast base URL based on mode
 */
export function getPayFastBase(mode: string): string {
  return mode === 'sandbox'
    ? 'https://sandbox.payfast.co.za'
    : 'https://www.payfast.co.za'
}

/**
 * Build PayFast process query string and signature (deterministic)
 * 
 * This is the single source of truth for /eng/process endpoint.
 * Uses alphabetical sorting for stable, deterministic signature generation.
 * 
 * @param rawParams - Parameters (order doesn't matter, will be sorted)
 * @param passphrase - Passphrase for signature (included in hash, not in query string)
 * @returns Object with queryString (without signature), signature, and toSign
 */
export function buildProcessQueryAndSignature(
  rawParams: Record<string, string>,
  passphrase?: string
): { queryString: string; signature: string; toSign: string } {
  // Filter out empty/undefined/null values
  const filtered: Record<string, string> = {}
  for (const [k, v] of Object.entries(rawParams)) {
    if (v !== undefined && v !== null && v !== '') {
      filtered[k] = v
    }
  }

  // Sort keys alphabetically (stable deterministic order)
  const keys = Object.keys(filtered).sort()
  
  // Encode helper: encodeURIComponent then replace %20 with +
  const enc = (s: string) => encodeURIComponent(s).replace(/%20/g, '+')

  // Build query string in sorted order
  const queryString = keys.map(k => `${k}=${enc(filtered[k])}`).join('&')
  
  // Build signature base string
  let toSign = queryString
  if (passphrase) {
    toSign += `&passphrase=${enc(passphrase)}`
  }

  // Compute MD5 hash
  const signature = crypto.createHash('md5').update(toSign).digest('hex')
  
  return { queryString, signature, toSign }
}

/**
 * Calculate PayFast signature for ITN validation
 * 
 * ⚠️ FOR ITN VALIDATION ONLY — NOT FOR PAYMENT CREATION ⚠️
 * 
 * IMPORTANT: ITN validation uses DIFFERENT algorithm than payment creation:
 * - ITN validation: Alphabetical sorting, encodeURIComponent().replace(/%20/g, '+')
 * - Payment creation: NO sorting, URLSearchParams.toString(), passphrase NOT encoded
 * 
 * This function is ONLY for validating signatures from PayFast ITN callbacks.
 * Do NOT use this for payment creation - use buildParamsAndSignature() instead.
 * 
 * @param params - Parameters to sign (excluding signature itself)
 * @param passphrase - Passphrase for signature
 * @returns Object with signature, queryString, and toSign for debugging
 */
export function calculatePayFastSignature(
  params: Record<string, string>,
  passphrase: string
): { signature: string; queryString: string; toSign: string } {
  // Filter out empty values and signature itself
  const { signature: _, ...paramsToSign } = params
  const filteredParams: Record<string, string> = {}
  
  for (const [key, value] of Object.entries(paramsToSign)) {
    if (value !== undefined && value !== null && value !== '') {
      filteredParams[key] = value
    }
  }
  
  // Sort parameters alphabetically (ITN validation requirement)
  const sortedKeys = Object.keys(filteredParams).sort()
  
  // Build query string with proper encoding (+ for spaces)
  const queryString = sortedKeys
    .map(key => {
      const value = filteredParams[key]
      return `${key}=${encodeURIComponent(value).replace(/%20/g, '+')}`
    })
    .join('&')
  
  // Build signature string with passphrase (encoded)
  const toSign = `${queryString}&passphrase=${encodeURIComponent(passphrase).replace(/%20/g, '+')}`
  
  // Compute MD5 hash
  const signature = crypto.createHash('md5').update(toSign).digest('hex')
  
  return {
    signature,
    queryString,
    toSign,
  }
}


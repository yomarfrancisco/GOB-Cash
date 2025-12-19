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
 * Build PayFast process query string and signature (ordered, no sorting)
 * 
 * This is the single source of truth for /eng/process endpoint.
 * Uses FIXED ORDER (insertion order) to match the known-working baseline.
 * 
 * IMPORTANT: This matches the old behavior that got us past /eng/process.
 * Do NOT sort alphabetically - PayFast /eng/process expects a specific order.
 * 
 * @param pairs - Ordered array of [key, value] tuples (order matters!)
 * @param passphrase - Passphrase for signature (included in hash, not in query string)
 * @returns Object with queryString (without signature), signature, and toSign
 */
export function buildProcessQueryAndSignatureOrdered(
  pairs: Array<[string, string]>,
  passphrase?: string
): { queryString: string; signature: string; toSign: string } {
  // IMPORTANT: Use the same encoding for queryString and toSign.
  // Start with the SAME behavior as the last known working create flow:
  // - URLSearchParams preserves append order
  // - URL encoding matches what the browser actually sends
  // - passphrase appended UNENCODED (legacy behavior for /eng/process)
  const params = new URLSearchParams()
  
  for (const [k, v] of pairs) {
    if (v !== undefined && v !== null && v !== '') {
      params.append(k, v)
    }
  }
  
  // Get query string (preserves append order, spaces → +)
  const queryString = params.toString()
  
  // Build signature base string (same as queryString)
  let toSign = queryString
  if (passphrase) {
    // Keep legacy behavior: passphrase unencoded for /eng/process
    toSign += `&passphrase=${passphrase}`
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


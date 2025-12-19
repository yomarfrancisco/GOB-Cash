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
 * Build PayFast parameters and signature
 * 
 * @param rawParams - Parameters in insertion order (no sorting)
 * @param passphrase - Passphrase for signature (included in hash, not in final params)
 * @returns Object with params (without passphrase) and signature
 */
export function buildParamsAndSignature(
  rawParams: Record<string, string>,
  passphrase?: string
): { params: Record<string, string>; signature: string; toSign: string } {
  // Create URLSearchParams to maintain insertion order and handle encoding
  const params = new URLSearchParams()
  
  // Add all params in order (spaces will become + in toString())
  for (const [key, value] of Object.entries(rawParams)) {
    if (value !== undefined && value !== null && value !== '') {
      params.append(key, value)
    }
  }
  
  // Build string to sign: params.toString() (spaces → +)
  let toSign = params.toString()
  
  // Add passphrase if provided (only for signature calculation)
  if (passphrase) {
    toSign += `&passphrase=${passphrase}`
  }
  
  // Compute MD5 hash
  const signature = crypto.createHash('md5').update(toSign).digest('hex')
  
  // Return params without passphrase, plus signature and toSign for debugging
  const finalParams: Record<string, string> = {}
  for (const [key, value] of params.entries()) {
    finalParams[key] = value
  }
  
  return {
    params: finalParams,
    signature,
    toSign,
  }
}


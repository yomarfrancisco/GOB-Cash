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
  params.forEach((value, key) => {
    finalParams[key] = value
  })
  
  return {
    params: finalParams,
    signature,
    toSign,
  }
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


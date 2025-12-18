/**
 * Lightweight TRON address validation (client-side safe)
 * Validates base58 format: starts with 'T', length 34, valid base58 characters
 * 
 * NOTE: This is format validation only, not cryptographic verification.
 * Server-side validation (in Cloud Function) is the source of truth.
 */
export function validateTronAddressClient(address: string): boolean {
  if (!address || typeof address !== 'string') {
    return false
  }
  
  const trimmed = address.trim()
  
  // Must start with 'T'
  if (!trimmed.startsWith('T')) {
    return false
  }
  
  // Must be exactly 34 characters
  if (trimmed.length !== 34) {
    return false
  }
  
  // Must contain only base58 characters (alphanumeric except 0, O, I, l)
  // Base58 alphabet: 123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz
  const base58Regex = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/
  if (!base58Regex.test(trimmed)) {
    return false
  }
  
  return true
}


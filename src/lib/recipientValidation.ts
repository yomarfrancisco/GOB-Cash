/**
 * Recipient Validation
 * Validates and normalizes recipient input for payment flows
 * Accepts $handle, @username, email, or WhatsApp phone number
 */

export function normalizeRecipientInput(raw: string): string {
  // Trim and collapse whitespace
  return raw.trim()
}

function isValidDollarHandle(value: string): boolean {
  if (!value.startsWith('$')) return false
  
  const body = value.slice(1)
  if (!body || body.length < 2) return false
  
  // Allow letters, numbers, dots, underscores, hyphens
  return /^[A-Za-z0-9._-]{2,}$/.test(body)
}

function isValidAtHandle(value: string): boolean {
  if (!value.startsWith('@')) return false
  
  const body = value.slice(1)
  if (!body || body.length < 1) return false
  
  // Same rules as old validateHandle: letters, numbers, underscores only
  return /^[A-Za-z0-9_]+$/.test(body)
}

function isValidEmail(value: string): boolean {
  // Simple email validation: non-whitespace chars, @, non-whitespace chars, ., non-whitespace chars
  return /^\S+@\S+\.\S+$/.test(value)
}

function isValidPhone(value: string): boolean {
  // Allow spaces, dashes, parentheses in raw input
  const cleaned = value.replace(/[()\s-]/g, '')
  
  if (!cleaned) return false
  
  // Must start with + or digit
  if (!/^[+0-9]/.test(cleaned[0])) return false
  
  // Strip a leading + only for length & digit checks
  const digitsOnly = cleaned[0] === '+' ? cleaned.slice(1) : cleaned
  
  // Must be all digits after cleaning
  if (!/^\d+$/.test(digitsOnly)) return false
  
  // Reasonable phone length range: 8-20 digits
  return digitsOnly.length >= 8 && digitsOnly.length <= 20
}

export function validateRecipientInput(value: string): boolean {
  const v = normalizeRecipientInput(value)
  if (!v) return false
  
  return isValidDollarHandle(v) || isValidAtHandle(v) || isValidEmail(v) || isValidPhone(v)
}


/**
 * Normalizes and validates a user handle input
 * Ensures handle starts with @, contains only valid characters,
 * and converts spaces to underscores
 */
export function normalizeHandle(value: string): string {
  let normalized = value

  // Always enforce a single @ prefix
  if (!normalized.startsWith('@')) {
    // Remove any existing @ symbols and add one at the start
    normalized = '@' + normalized.replace(/^@+/g, '')
  }
  
  // Ensure only one @ at the start, remove any @ symbols after the first character
  const afterAt = normalized.slice(1).replace(/@/g, '')
  
  // Remove spaces and replace with underscores
  const sanitized = afterAt.replace(/\s/g, '_')
  
  normalized = '@' + sanitized

  return normalized
}

/**
 * Validates a user handle
 * Returns true if handle is valid (starts with @, has at least one char after @, and contains only valid chars)
 */
export function validateHandle(handle: string): boolean {
  // Must start with @ and have at least one character after
  if (!handle.startsWith('@') || handle.length <= 1) {
    return false
  }

  // Validate handle format (alphanumeric + underscore only after @)
  const handlePart = handle.slice(1)
  if (!/^[a-zA-Z0-9_]+$/.test(handlePart)) {
    return false
  }

  return true
}


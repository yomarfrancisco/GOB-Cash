/**
 * Generate a unique request ID for idempotency
 * Uses crypto.randomUUID() if available, falls back to Date.now() + Math.random()
 */
export function generateRequestId(): string {
  // Try crypto.randomUUID() first (modern browsers)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  
  // Fallback: Date.now() + Math.random() + counter
  // Format: timestamp-random-counter
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 15)
  const counter = Math.floor(Math.random() * 10000)
  
  return `${timestamp}-${random}-${counter}`
}


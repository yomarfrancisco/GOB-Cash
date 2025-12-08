/**
 * Generates a user handle from an email address
 * Example: "john.doe@gmail.com" -> "@johndoe"
 */
export function generateHandleFromEmail(email: string): string {
  // Extract username part before @
  const username = email.split('@')[0]
  // Remove dots, make lowercase, and take first 20 chars
  const clean = username.replace(/\./g, '').toLowerCase().slice(0, 20)
  // Ensure it starts with @
  return `@${clean}`
}


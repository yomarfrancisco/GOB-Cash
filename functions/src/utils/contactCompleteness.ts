/**
 * Contact completeness scoring utility
 * Computes a 0-1 score based on available contact fields
 */

/**
 * Computes contact completeness score
 * displayName: 0.4, primaryEmail: 0.3, primaryPhone: 0.3
 * @param contact - Contact document data
 * @returns Completeness score (0-1)
 */
export function computeContactCompleteness(contact: {
  displayName?: string | null
  primaryEmail?: string | null
  primaryPhone?: string | null
}): number {
  let score = 0
  if (contact.displayName) score += 0.4
  if (contact.primaryEmail) score += 0.3
  if (contact.primaryPhone) score += 0.3
  return Math.min(1, score)
}


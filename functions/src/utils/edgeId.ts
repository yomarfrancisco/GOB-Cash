/**
 * Edge ID generation utility
 * Creates stable, deterministic edge IDs for graphEdges collection
 */

/**
 * Generates a stable edge ID from edge components
 * Format: {fromUserId}::{toHandle}::{edgeType}::{source}
 * @param fromUserId - User ID who has this contact
 * @param toHandle - Normalized handle being referenced
 * @param edgeType - Type of edge (e.g., 'contact')
 * @param source - Source of the edge (e.g., 'deviceContacts')
 * @returns Stable edge ID string
 */
export function generateEdgeId(
  fromUserId: string,
  toHandle: string,
  edgeType: string = 'contact',
  source: string = 'deviceContacts'
): string {
  return `${fromUserId}::${toHandle}::${edgeType}::${source}`
}


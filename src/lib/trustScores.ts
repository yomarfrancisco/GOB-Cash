/**
 * Trust score calculation functions
 * Implements local trust, global trust, and combined display trust
 */

/**
 * Compute direct weight based on edge type
 */
export function directWeight(isMutual: boolean, hasOneWay: boolean): number {
  if (!hasOneWay) return 0
  return isMutual ? 4 : 1 // reviewer: mutual is qualitatively stronger
}

/**
 * Compute mutual normalized score
 * |C(U) ∩ C(V)| / sqrt(|C(U)| * |C(V)|)
 * 
 * For now, simplified version using contact counts
 */
export function mutualNormalized(
  userContactCount: number,
  otherContactCount: number,
  sharedMutuals: number
): number {
  if (userContactCount === 0 || otherContactCount === 0) return 0
  const denominator = Math.sqrt(userContactCount * otherContactCount)
  if (denominator === 0) return 0
  return Math.min(1, sharedMutuals / denominator)
}

/**
 * Compute distance weight using BFS up to depth 3
 * dist=1 → 1.0, dist=2 → 0.5, dist=3 → 0.25, else 0
 * 
 * For now, simplified version - in production would do actual BFS
 */
export function distanceWeight(distance: number | null): number {
  if (distance === null || distance === 0) return 0
  if (distance === 1) return 1.0
  if (distance === 2) return 0.5
  if (distance === 3) return 0.25
  return 0
}

/**
 * Compute triangle score
 * Normalize sharedMutuals / 10, capped at 1.0
 */
export function triangleScore(sharedMutuals: number): number {
  return Math.min(1, sharedMutuals / 10)
}

/**
 * Recency bonus (stub for now)
 * TODO: Incorporate transaction history
 */
export function recencyBonus(): number {
  return 0 // Stub
}

/**
 * Compute local trust score
 */
export function trustLocal(params: {
  directWeight: number
  mutualNormalized: number // 0..1
  distanceWeight: number // 0..1
  triangleScore: number // 0..1
  recencyBonus?: number // 0..1, default 0
}): number {
  const { directWeight, mutualNormalized, distanceWeight, triangleScore, recencyBonus = 0 } = params
  
  return (
    0.35 * directWeight + // 0,1,4
    0.25 * mutualNormalized + // 0..1
    0.20 * distanceWeight + // 0,0.5,1 pattern
    0.15 * triangleScore + // 0..1
    0.05 * recencyBonus // 0..1
  )
}

/**
 * Convenience wrapper to compute local trust between two users
 * TODO: Implement full lookup of edges/mutuals/distance
 */
export async function computeTrustLocal(
  fromUserId: string,
  toUserId: string
): Promise<number> {
  // Stub implementation - in production would:
  // 1. Look up edges between users
  // 2. Compute mutuals
  // 3. Compute distance via BFS
  // 4. Get triangle count
  
  // For now, return a placeholder
  console.debug('[TrustScores] computeTrustLocal (stub)', { fromUserId, toUserId })
  return 0.5 // Placeholder
}

/**
 * Compute global trust score from metrics
 * Includes cold-start floor and isolation penalty
 */
export function trustGlobalFromMetrics(params: {
  isVerifiedAgent: boolean
  jobSuccessRate: number // 0..1
  disputeRate: number // 0..1
  isolationPenalty: number // 0..1 (from isolationScore)
  accountAgeDays: number
}): number {
  const tenureBonus = Math.min(0.1, (params.accountAgeDays / 365) * 0.1)
  
  let score =
    0.50 +
    0.10 * (params.isVerifiedAgent ? 1 : 0) +
    0.15 * params.jobSuccessRate +
    0.10 * tenureBonus -
    0.20 * params.disputeRate -
    0.15 * params.isolationPenalty
  
  // Cold-start floor
  score = Math.max(0.3, score)
  
  // Clamp to [0, 1]
  return Math.min(1, Math.max(0, score))
}

/**
 * Compute dynamic λ for user based on contacts on platform
 */
export function lambdaForUser(contactsOnPlatform: number): number {
  return Math.min(0.7, contactsOnPlatform / 10)
}

/**
 * Compute combined display trust
 */
export function trustDisplay(local: number, global: number, lambda: number): number {
  return lambda * local + (1 - lambda) * global
}


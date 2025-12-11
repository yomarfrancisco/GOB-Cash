/**
 * Social graph type definitions
 */

export type GraphEdgeType = 'contact' | 'transaction' | 'backing' | 'block' | 'dispute' | 'report'
export type GraphEdgeSource = 'deviceContacts' | 'gmail' | 'manual' | 'system'

/**
 * Graph edge document in /graphEdges collection
 * Doc ID: edgeId (stable hash of fromUserId + toHandle + edgeType)
 */
export interface GraphEdgeDocument {
  edgeId: string
  fromUserId: string
  toHandle: string
  toUserId: string | null // populated when handle is claimed
  edgeType: GraphEdgeType
  source: GraphEdgeSource
  weight: number // base weight, default 1 for 'contact'
  isMutual: boolean // true if reverse edge exists
  createdAt: any // Firebase Timestamp
  updatedAt: any // Firebase Timestamp
}

/**
 * Social metrics document in /users/{userId}/socialMetrics/current
 */
export interface SocialMetricsDocument {
  inboundEdgeCount: number // # of people who have me
  outboundEdgeCount: number // # of people I have
  mutualEdgeCount: number // bidirectional connections
  contactsOnPlatform: number // my contacts who are signed-up users
  mutualContactsOnPlatform: number // mutual + on-platform
  triangleCount: number // closed triangles I'm part of
  clusteringCoefficient: number // 0..1
  isolationScore: number // 0 = well-connected, 1 = isolated (used as isolationPenalty)
  trustGlobal: number // my global trust score (0..1)
  lastComputedAt: any // Firebase Timestamp
}


/**
 * Social graph edge management
 * Creates and updates graph edges in Firestore /graphEdges collection
 */

'use client'

import { collection, doc, setDoc, getDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore'
import { getFirestoreDb } from '@/lib/firebase'
import type { GraphEdgeDocument, GraphEdgeType, GraphEdgeSource } from '@/types/socialGraph'
import { GRAPH_EDGES_ENABLED } from '@/config/featureFlags'
import { devLog, devDebug } from '@/lib/logger'

/**
 * Generate stable edgeId from fromUserId + toHandle + edgeType
 */
export function generateEdgeId(fromUserId: string, toHandle: string, edgeType: GraphEdgeType): string {
  const input = `${fromUserId}:${toHandle}:${edgeType}`
  // Use a simple hash for client-side (in production, use crypto.subtle or server-side)
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return `edge:${Math.abs(hash).toString(36)}`
}

/**
 * Get graphEdges collection reference
 */
export function getGraphEdgesCollectionRef() {
  return collection(getFirestoreDb(), 'graphEdges')
}

/**
 * Get a specific graph edge document reference
 */
export function getGraphEdgeDocRef(edgeId: string) {
  return doc(getFirestoreDb(), 'graphEdges', edgeId)
}

/**
 * Check if a reverse edge exists (mutual connection)
 */
export async function checkMutualEdge(
  fromUserId: string,
  toHandle: string,
  toUserId: string | null
): Promise<boolean> {
  if (!GRAPH_EDGES_ENABLED) {
    devDebug('[GraphEdges] Skipping mutual edge check (feature flag disabled)', {
      fromUserId,
      toHandle,
    })
    return false
  }
  
  try {
    const db = getFirestoreDb()
    const edgesRef = collection(db, 'graphEdges')
    
    // Check for reverse edge: someone else has this user as a contact
    // We check by handle first (for unclaimed handles)
    const handleQuery = query(
      edgesRef,
      where('toHandle', '==', fromUserId),
      where('fromUserId', '!=', fromUserId)
    )
    const handleSnapshot = await getDocs(handleQuery)
    if (!handleSnapshot.empty) {
      return true
    }
    
    // If toUserId is known, also check by userId
    if (toUserId) {
      const userIdQuery = query(
        edgesRef,
        where('toUserId', '==', fromUserId),
        where('fromUserId', '==', toUserId)
      )
      const userIdSnapshot = await getDocs(userIdQuery)
      if (!userIdSnapshot.empty) {
        return true
      }
    }
    
    return false
  } catch (err) {
    console.error('[GraphEdges] Error checking mutual edge', { fromUserId, toHandle, err })
    return false
  }
}

/**
 * Create or update a graph edge
 */
export async function upsertGraphEdge(params: {
  fromUserId: string
  toHandle: string
  toUserId: string | null
  edgeType: GraphEdgeType
  source: GraphEdgeSource
  weight?: number
}): Promise<void> {
  if (!GRAPH_EDGES_ENABLED) {
    devDebug('[GraphEdges] Skipping edge upsert (feature flag disabled)', {
      fromUserId: params.fromUserId,
      toHandle: params.toHandle,
    })
    return
  }
  
  const { fromUserId, toHandle, toUserId, edgeType, source, weight = 1 } = params
  
  try {
    const edgeId = generateEdgeId(fromUserId, toHandle, edgeType)
    const edgeRef = getGraphEdgeDocRef(edgeId)
    
    // Check if reverse edge exists (mutual connection)
    const isMutual = await checkMutualEdge(fromUserId, toHandle, toUserId)
    
    // Also check if we need to mark the reverse edge as mutual
    if (isMutual) {
      // Find and update the reverse edge
      const db = getFirestoreDb()
      const edgesRef = collection(db, 'graphEdges')
      
      // Try to find reverse edge by handle
      const reverseQuery = query(
        edgesRef,
        where('fromUserId', '==', toUserId || toHandle),
        where('toHandle', '==', fromUserId)
      )
      const reverseSnapshot = await getDocs(reverseQuery)
      
      if (!reverseSnapshot.empty) {
        const reverseEdge = reverseSnapshot.docs[0]
        await setDoc(
          doc(db, 'graphEdges', reverseEdge.id),
          { isMutual: true, updatedAt: serverTimestamp() },
          { merge: true }
        )
      }
    }
    
    const now = serverTimestamp()
    const edgeDoc: GraphEdgeDocument = {
      edgeId,
      fromUserId,
      toHandle,
      toUserId,
      edgeType,
      source,
      weight,
      isMutual,
      createdAt: now,
      updatedAt: now,
    }
    
    await setDoc(edgeRef, edgeDoc, { merge: true })
    devLog('[GraphEdges] Upserted edge', { edgeId, fromUserId, toHandle, isMutual })
  } catch (err) {
    console.error('[GraphEdges] Failed to upsert edge', { fromUserId, toHandle, err })
    throw err
  }
}

/**
 * Create negative edge (block, dispute, report)
 * Placeholder for future implementation
 */
export async function createNegativeEdge(params: {
  fromUserId: string
  toHandle: string
  toUserId: string | null
  edgeType: 'block' | 'dispute' | 'report'
  source: GraphEdgeSource
}): Promise<void> {
  // TODO: Implement negative edge creation
  // For now, just log
  devLog('[GraphEdges] Negative edge creation (stub)', params)
  await upsertGraphEdge({
    ...params,
    edgeType: params.edgeType,
    weight: -1, // Negative weight for negative edges
  })
}


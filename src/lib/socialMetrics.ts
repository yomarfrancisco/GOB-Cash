/**
 * Social metrics computation and storage
 * Computes degree, mutuals, triangles, clustering, isolation, and global trust
 */

'use client'

import { collection, doc, setDoc, getDocs, query, where, serverTimestamp, getDoc } from 'firebase/firestore'
import { getFirestoreDb } from '@/lib/firebase'
import type { SocialMetricsDocument } from '@/types/socialGraph'
import { trustGlobalFromMetrics } from './trustScores'

const MAX_NEIGHBORS_FOR_TRIANGLES = 200

/**
 * Get social metrics document reference
 */
export function getSocialMetricsDocRef(userId: string) {
  return doc(getFirestoreDb(), 'users', userId, 'socialMetrics', 'current')
}

/**
 * Compute contact completeness score (0..1)
 */
export function computeContactCompleteness(contact: {
  displayName?: string | null
  primaryEmail?: string | null
  primaryPhone?: string | null
}): number {
  let score = 0
  if (contact.displayName) score += 0.4
  if (contact.primaryPhone) score += 0.3
  if (contact.primaryEmail) score += 0.3
  return Math.min(1, score)
}

/**
 * Recompute social metrics for a user
 */
export async function recomputeSocialMetrics(userId: string): Promise<void> {
  try {
    console.log('[SocialMetrics] Recomputing metrics for user', userId)
    
    const db = getFirestoreDb()
    const edgesRef = collection(db, 'graphEdges')
    
    // Load all edges where fromUserId = userId (outbound)
    const outboundQuery = query(edgesRef, where('fromUserId', '==', userId))
    const outboundSnapshot = await getDocs(outboundQuery)
    const outboundEdges = outboundSnapshot.docs.map(doc => doc.data())
    
    // Load all edges where toUserId = userId (inbound)
    // Note: This requires a composite index in Firestore
    const inboundQuery = query(edgesRef, where('toUserId', '==', userId))
    const inboundSnapshot = await getDocs(inboundQuery)
    const inboundEdges = inboundSnapshot.docs.map(doc => doc.data())
    
    // Basic counts
    const outboundEdgeCount = outboundEdges.length
    const inboundEdgeCount = inboundEdges.length
    
    // Mutual edges (bidirectional connections)
    const mutualEdges = outboundEdges.filter(edge => edge.isMutual === true && edge.toUserId !== null)
    const mutualEdgeCount = mutualEdges.length
    
    // Contacts on platform (outbound edges with toUserId != null)
    const contactsOnPlatform = outboundEdges.filter(edge => edge.toUserId !== null).length
    
    // Mutual contacts on platform
    const mutualContactsOnPlatform = mutualEdgeCount
    
    // Triangle count & clustering coefficient
    // Get unique neighbor userIds (limit to 200 for performance)
    const neighborSet = new Set<string>()
    for (const edge of outboundEdges) {
      if (edge.toUserId) {
        neighborSet.add(edge.toUserId)
        if (neighborSet.size >= MAX_NEIGHBORS_FOR_TRIANGLES) {
          console.log('[SocialMetrics] Neighbor limit reached', { userId, limit: MAX_NEIGHBORS_FOR_TRIANGLES })
          break
        }
      }
    }
    
    for (const edge of inboundEdges) {
      if (edge.fromUserId) {
        neighborSet.add(edge.fromUserId)
        if (neighborSet.size >= MAX_NEIGHBORS_FOR_TRIANGLES) {
          console.log('[SocialMetrics] Neighbor limit reached', { userId, limit: MAX_NEIGHBORS_FOR_TRIANGLES })
          break
        }
      }
    }
    
    const neighbors = Array.from(neighborSet)
    let triangleCount = 0
    let actualEdgesAmongN = 0
    
    // Check for triangles (edges between neighbors)
    // Limit to reasonable pairs to avoid O(n^2) queries
    const maxPairs = Math.min(100, (neighbors.length * (neighbors.length - 1)) / 2)
    let pairsChecked = 0
    
    for (let i = 0; i < neighbors.length && pairsChecked < maxPairs; i++) {
      for (let j = i + 1; j < neighbors.length && pairsChecked < maxPairs; j++) {
        pairsChecked++
        const v = neighbors[i]
        const w = neighbors[j]
        
        // Check if edge exists between v and w (either direction)
        // Note: Firestore 'in' queries are limited to 10 items, so we check both directions separately
        const edgeVWQuery1 = query(
          edgesRef,
          where('fromUserId', '==', v),
          where('toUserId', '==', w)
        )
        const edgeVWQuery2 = query(
          edgesRef,
          where('fromUserId', '==', w),
          where('toUserId', '==', v)
        )
        
        const [snapshot1, snapshot2] = await Promise.all([
          getDocs(edgeVWQuery1),
          getDocs(edgeVWQuery2),
        ])
        
        if (!snapshot1.empty || !snapshot2.empty) {
          actualEdgesAmongN++
          // If both v and w are connected to userId, this forms a triangle
          // (v and w are already in neighborSet, so if they're connected, it's a triangle)
          triangleCount++
        }
      }
    }
    
    // Clustering coefficient
    const possibleEdgesAmongN = neighbors.length > 1
      ? (neighbors.length * (neighbors.length - 1)) / 2
      : 0
    const clusteringCoefficient = possibleEdgesAmongN > 0
      ? actualEdgesAmongN / possibleEdgesAmongN
      : 0
    
    // Isolation score / penalty
    // Simplified: 1 - (externalEdges / totalEdges)
    const totalEdges = inboundEdgeCount + outboundEdgeCount
    const externalEdges = Math.max(0, totalEdges - mutualEdgeCount) // Rough approximation
    const isolationScore = totalEdges > 0
      ? Math.max(0, Math.min(1, 1 - (externalEdges / totalEdges)))
      : 1 // if no edges, fully isolated
    
    // Global trust score
    // Get user document to compute account age
    const userDocRef = doc(db, 'users', userId)
    const userDoc = await getDoc(userDocRef)
    const userData = userDoc.data()
    
    const accountAgeDays = userData?.createdAt
      ? Math.floor((Date.now() - userData.createdAt.toMillis()) / (1000 * 60 * 60 * 24))
      : 0
    
    // TODO: Get jobSuccessRate and disputeRate from transaction/dispute data
    // For now, stub them
    const jobSuccessRate = 0 // TODO: Compute from transaction history
    const disputeRate = 0 // TODO: Compute from dispute edges
    
    const trustGlobal = trustGlobalFromMetrics({
      isVerifiedAgent: userData?.isAgent === true,
      jobSuccessRate,
      disputeRate,
      isolationPenalty: isolationScore,
      accountAgeDays,
    })
    
    // Store metrics
    const metricsDoc: SocialMetricsDocument = {
      inboundEdgeCount,
      outboundEdgeCount,
      mutualEdgeCount,
      contactsOnPlatform,
      mutualContactsOnPlatform,
      triangleCount,
      clusteringCoefficient,
      isolationScore,
      trustGlobal,
      lastComputedAt: serverTimestamp(),
    }
    
    const metricsRef = getSocialMetricsDocRef(userId)
    await setDoc(metricsRef, metricsDoc, { merge: true })
    
    console.log('[SocialMetrics] Computed and stored metrics', {
      userId,
      outboundEdgeCount,
      inboundEdgeCount,
      mutualEdgeCount,
      triangleCount,
      trustGlobal,
    })
    
    // If user has a handle in /directory, mirror trustGlobal
    if (userData?.handle) {
      const directoryRef = doc(db, 'directory', userData.handle.toLowerCase())
      await setDoc(
        directoryRef,
        { trustGlobal, updatedAt: serverTimestamp() },
        { merge: true }
      )
    }
  } catch (err) {
    console.error('[SocialMetrics] Failed to recompute metrics', { userId, err })
    throw err
  }
}


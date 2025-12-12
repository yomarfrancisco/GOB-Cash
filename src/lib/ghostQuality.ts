/**
 * Ghost quality computation for unclaimed directory entries
 * Computes quality score based on inbound edges, completeness, and mutuals
 */

'use client'

import { collection, doc, getDocs, query, where, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { getFirestoreDb } from '@/lib/firebase'
import { computeContactCompleteness } from './socialMetrics'
import { GHOST_QUALITY_ENABLED } from '@/config/featureFlags'
import { devLog, devDebug, devWarn } from '@/lib/logger'

const MAX_REFERRERS_FOR_MUTUALS = 20

/**
 * Compute mutuals between referrers (users who have this handle)
 * Returns fraction of referrers that are mutually connected
 */
async function computeMutualsBetweenReferrers(handle: string): Promise<number> {
  try {
    const db = getFirestoreDb()
    const edgesRef = collection(db, 'graphEdges')
    
    // Get all edges pointing to this handle
    const handleEdgesQuery = query(
      edgesRef,
      where('toHandle', '==', handle),
      where('edgeType', '==', 'contact')
    )
    const handleEdgesSnapshot = await getDocs(handleEdgesQuery)
    
    if (handleEdgesSnapshot.empty) return 0
    
    const referrerUserIds = new Set<string>()
    handleEdgesSnapshot.docs.forEach(doc => {
      const data = doc.data()
      if (data.fromUserId) {
        referrerUserIds.add(data.fromUserId)
      }
    })
    
    const referrers = Array.from(referrerUserIds).slice(0, MAX_REFERRERS_FOR_MUTUALS)
    if (referrers.length < 2) return 0
    
    // Check for mutual connections among referrers
    let mutualPairs = 0
    let pairsChecked = 0
    const maxPairs = Math.min(50, (referrers.length * (referrers.length - 1)) / 2)
    
    for (let i = 0; i < referrers.length && pairsChecked < maxPairs; i++) {
      for (let j = i + 1; j < referrers.length && pairsChecked < maxPairs; j++) {
        pairsChecked++
        const v = referrers[i]
        const w = referrers[j]
        
        // Check if mutual edge exists
        const mutualQuery = query(
          edgesRef,
          where('fromUserId', 'in', [v, w]),
          where('toUserId', 'in', [v, w]),
          where('isMutual', '==', true)
        )
        const mutualSnapshot = await getDocs(mutualQuery)
        
        if (!mutualSnapshot.empty) {
          mutualPairs++
        }
      }
    }
    
    const possiblePairs = (referrers.length * (referrers.length - 1)) / 2
    return possiblePairs > 0 ? mutualPairs / possiblePairs : 0
  } catch (err) {
    console.error('[GhostQuality] Error computing mutuals between referrers', { handle, err })
    return 0
  }
}

/**
 * Normalize a score to [0, 1] range
 */
function normalize(score: number, min: number, max: number): number {
  if (max === min) return 0.5
  return Math.max(0, Math.min(1, (score - min) / (max - min)))
}

/**
 * Compute and update ghost quality for a directory entry
 */
export async function updateGhostQuality(
  handle: string,
  contactCompleteness: number
): Promise<number> {
  if (!GHOST_QUALITY_ENABLED) {
    devDebug('[GhostQuality] Skipping ghost quality update (feature flag disabled)', { handle })
    return 0
  }
  
  try {
    const db = getFirestoreDb()
    const directoryRef = doc(db, 'directory', handle.toLowerCase())
    const directoryDoc = await getDoc(directoryRef)
    
    if (!directoryDoc.exists()) {
      devWarn('[GhostQuality] Directory entry not found', { handle })
      return 0
    }
    
    const directoryData = directoryDoc.data()
    const inboundEdgeCount = directoryData?.inboundEdgeCount || 0
    
    // Compute average contact completeness
    // For now, use the current contact's completeness
    // In production, would aggregate across all referrers
    const avgContactCompleteness = contactCompleteness
    
    // Compute mutuals between referrers
    const mutualsBetweenReferrers = await computeMutualsBetweenReferrers(handle)
    
    // Compute ghost quality
    // Normalize components (rough estimates for min/max)
    const normalizedInbound = normalize(inboundEdgeCount, 0, 100) // Assume max 100 referrers
    const normalizedCompleteness = avgContactCompleteness // Already 0..1
    const normalizedMutuals = mutualsBetweenReferrers // Already 0..1
    
    const ghostQuality = Math.min(1, Math.max(0,
      normalizedInbound * 0.4 +
      normalizedCompleteness * 0.3 +
      normalizedMutuals * 0.3
    ))
    
    // Update directory entry
    await setDoc(
      directoryRef,
      {
        avgContactCompleteness: normalizedCompleteness,
        ghostQuality,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    )
    
    devLog('[GhostQuality] Updated ghost quality', {
      handle,
      inboundEdgeCount,
      avgContactCompleteness: normalizedCompleteness,
      mutualsBetweenReferrers,
      ghostQuality,
    })
    
    return ghostQuality
  } catch (err) {
    console.error('[GhostQuality] Failed to update ghost quality', { handle, err })
    return 0
  }
}

/**
 * Increment inbound edge count for a directory entry
 */
export async function incrementDirectoryInboundCount(handle: string): Promise<void> {
  if (!GHOST_QUALITY_ENABLED) {
    devDebug('[GhostQuality] Skipping inbound count increment (feature flag disabled)', { handle })
    return
  }
  
  try {
    const db = getFirestoreDb()
    const directoryRef = doc(db, 'directory', handle.toLowerCase())
    const dirDoc = await getDoc(directoryRef)
    const currentCount = dirDoc.data()?.inboundEdgeCount || 0
    
    await setDoc(
      directoryRef,
      {
        inboundEdgeCount: currentCount + 1,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    )
  } catch (err) {
    console.error('[GhostQuality] Failed to increment inbound count', { handle, err })
    // Non-blocking
  }
}


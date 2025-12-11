/**
 * Cloud Function: recomputeGhostQuality
 * Scheduled function that periodically recomputes ghostQuality for directory entries
 * 
 * Runs every 30 minutes, processes directory in batches to avoid timeouts
 */

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

const db = admin.firestore()
const BATCH_SIZE = 300 // Process 300 docs per run to avoid timeouts

/**
 * Computes ghost quality score for a directory entry
 * Formula: (normalizedInboundEdgeCount * 0.6) + (avgContactCompleteness * 0.4)
 * Normalizes inboundEdgeCount to 0-1 range (assuming max of 100 for minimal version)
 */
function computeGhostQuality(
  inboundEdgeCount: number = 0,
  avgContactCompleteness: number = 0
): number {
  // Normalize inboundEdgeCount to 0-1 range (max 100 referrers)
  const normalizedInbound = Math.min(1, inboundEdgeCount / 100)
  
  // Compute ghost quality
  const ghostQuality = normalizedInbound * 0.6 + avgContactCompleteness * 0.4
  
  return Math.min(1, Math.max(0, ghostQuality))
}

export const recomputeGhostQuality = functions.pubsub
  .schedule('every 30 minutes')
  .timeZone('UTC')
  .onRun(async (context) => {
    console.log('[recomputeGhostQuality] Starting scheduled run', {
      timestamp: new Date().toISOString(),
    })

    let lastDoc: admin.firestore.QueryDocumentSnapshot | null = null
    let totalProcessed = 0
    let totalUpdated = 0

    try {
      while (true) {
        // Build query with pagination
        let query: admin.firestore.Query = db.collection('directory').limit(BATCH_SIZE)

        if (lastDoc) {
          query = query.startAfter(lastDoc)
        }

        const snapshot = await query.get()

        if (snapshot.empty) {
          console.log('[recomputeGhostQuality] No more documents to process')
          break
        }

        const batch = db.batch()
        let batchCount = 0

        snapshot.docs.forEach((doc) => {
          const data = doc.data()
          const inboundEdgeCount = data.inboundEdgeCount || 0
          const avgContactCompleteness = data.avgContactCompleteness || 0

          // Compute new ghost quality
          const newGhostQuality = computeGhostQuality(inboundEdgeCount, avgContactCompleteness)

          // Only update if ghostQuality changed (or doesn't exist)
          const currentGhostQuality = data.ghostQuality
          if (currentGhostQuality !== newGhostQuality) {
            batch.update(doc.ref, {
              ghostQuality: newGhostQuality,
              updatedAt: admin.firestore.Timestamp.now(),
            })
            batchCount++
          }
        })

        // Commit batch
        if (batchCount > 0) {
          await batch.commit()
          totalUpdated += batchCount
          console.log('[recomputeGhostQuality] Updated batch', {
            batchSize: batchCount,
            totalUpdated,
          })
        }

        totalProcessed += snapshot.docs.length
        lastDoc = snapshot.docs[snapshot.docs.length - 1]

        // If we got fewer docs than batch size, we're done
        if (snapshot.docs.length < BATCH_SIZE) {
          break
        }

        // Safety: limit total processing to avoid timeout
        if (totalProcessed >= 10000) {
          console.log('[recomputeGhostQuality] Reached processing limit, stopping', {
            totalProcessed,
          })
          break
        }
      }

      console.log('[recomputeGhostQuality] Completed run', {
        totalProcessed,
        totalUpdated,
        timestamp: new Date().toISOString(),
      })

      return null
    } catch (error) {
      console.error('[recomputeGhostQuality] Error during scheduled run', {
        error: error instanceof Error ? error.message : String(error),
        totalProcessed,
        totalUpdated,
      })
      // Re-throw to trigger retry
      throw error
    }
  })


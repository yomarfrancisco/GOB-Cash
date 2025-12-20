/**
 * Backfill User Payments Subcollection
 * 
 * One-off script to copy existing payments from global collection
 * to user subcollections (users/{uid}/payments/{ref})
 * 
 * Usage:
 *   tsx scripts/backfill-user-payments.ts [--batch-size=100] [--resume-from=<ref>]
 * 
 * Features:
 *   - Idempotent: skips payments that already exist in subcollection
 *   - Resumable: can resume from a specific payment ref
 *   - Progress logging: shows progress and errors
 *   - Batch processing: processes in configurable batches
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import * as readline from 'readline'

// Initialize Firebase Admin
function initializeFirebaseAdmin() {
  if (getApps().length === 0) {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
      : {
          projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
          clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }

    if (!serviceAccount.projectId || !serviceAccount.clientEmail || !serviceAccount.privateKey) {
      throw new Error('Firebase Admin credentials missing. Set FIREBASE_SERVICE_ACCOUNT_JSON or individual env vars.')
    }

    initializeApp({
      credential: cert(serviceAccount),
    })
  }

  return getFirestore()
}

/**
 * Create slim payment projection for subcollection
 */
function createPaymentProjection(paymentData: any, ref: string): Record<string, any> {
  return {
    ref,
    userId: paymentData.userId,
    amountZAR: paymentData.amountZAR || 0,
    currency: paymentData.currency || 'ZAR',
    status: paymentData.status || 'PENDING',
    createdAt: paymentData.createdAt || new Date(),
    updatedAt: paymentData.updatedAt || paymentData.createdAt || new Date(),
    creditedAt: paymentData.creditedAt || null,
    completedAt: paymentData.completedAt || null,
    provider: paymentData.provider || 'payfast',
    // Pointer to global doc
    _globalDocPath: `payments/${ref}`,
  }
}

/**
 * Backfill payments for a single user
 */
async function backfillUserPayments(
  db: Firestore,
  userId: string,
  payments: Array<{ ref: string; data: any }>
): Promise<{ success: number; skipped: number; failed: number }> {
  const stats = { success: 0, skipped: 0, failed: 0 }

  for (const { ref, data } of payments) {
    try {
      // Check if already exists in subcollection (idempotent)
      const userPaymentRef = db.collection('users').doc(userId).collection('payments').doc(ref)
      const existingDoc = await userPaymentRef.get()

      if (existingDoc.exists) {
        stats.skipped++
        continue
      }

      // Create slim projection
      const projection = createPaymentProjection(data, ref)

      // Write to subcollection
      await userPaymentRef.set(projection)
      stats.success++
    } catch (error: any) {
      console.error(`[Backfill] Failed to backfill payment ${ref} for user ${userId}:`, error.message)
      stats.failed++
    }
  }

  return stats
}

/**
 * Main backfill function
 */
async function main() {
  const args = process.argv.slice(2)
  const batchSize = parseInt(args.find(arg => arg.startsWith('--batch-size='))?.split('=')[1] || '100', 10)
  const resumeFrom = args.find(arg => arg.startsWith('--resume-from='))?.split('=')[1]

  console.log('[Backfill] Starting payment backfill', {
    batchSize,
    resumeFrom: resumeFrom || 'start',
  })

  const db = initializeFirebaseAdmin()
  const paymentsRef = db.collection('payments')

  let query = paymentsRef.orderBy('createdAt', 'desc').limit(batchSize)
  
  // Resume from specific ref if provided
  if (resumeFrom) {
    const resumeDoc = await paymentsRef.doc(resumeFrom).get()
    if (resumeDoc.exists) {
      const resumeData = resumeDoc.data()!
      query = paymentsRef
        .orderBy('createdAt', 'desc')
        .startAfter(resumeData.createdAt)
        .limit(batchSize)
    }
  }

  let totalStats = { success: 0, skipped: 0, failed: 0 }
  let lastRef: string | null = null
  let batchCount = 0

  while (true) {
    try {
      const snapshot = await query.get()

      if (snapshot.empty) {
        console.log('[Backfill] No more payments to process')
        break
      }

      // Group payments by userId
      const paymentsByUser: Record<string, Array<{ ref: string; data: any }>> = {}
      
      snapshot.forEach((doc) => {
        const data = doc.data()
        if (data.userId) {
          if (!paymentsByUser[data.userId]) {
            paymentsByUser[data.userId] = []
          }
          paymentsByUser[data.userId].push({ ref: doc.id, data })
        }
        lastRef = doc.id
      })

      // Process each user's payments
      for (const [userId, payments] of Object.entries(paymentsByUser)) {
        const userStats = await backfillUserPayments(db, userId, payments)
        totalStats.success += userStats.success
        totalStats.skipped += userStats.skipped
        totalStats.failed += userStats.failed
      }

      batchCount++
      console.log(`[Backfill] Batch ${batchCount} processed`, {
        payments: snapshot.size,
        lastRef,
        totalStats,
      })

      // Prepare next batch query
      if (snapshot.size < batchSize) {
        break // Last batch
      }

      const lastDoc = snapshot.docs[snapshot.docs.length - 1]
      query = paymentsRef
        .orderBy('createdAt', 'desc')
        .startAfter(lastDoc.data().createdAt)
        .limit(batchSize)

    } catch (error: any) {
      console.error('[Backfill] Error processing batch:', error.message)
      console.log('[Backfill] To resume, run with --resume-from=' + (lastRef || 'start'))
      process.exit(1)
    }
  }

  console.log('[Backfill] Backfill complete', {
    batches: batchCount,
    totalStats,
    lastRef,
  })
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('[Backfill] Fatal error:', error)
    process.exit(1)
  })
}

export { main as backfillUserPayments }


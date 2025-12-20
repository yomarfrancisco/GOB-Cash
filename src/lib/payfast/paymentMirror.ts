/**
 * Payment Mirroring Utility
 * Centralized function to mirror payments to user subcollection
 * Used by all payment write operations for consistency
 */

import type { firestore } from 'firebase-admin'

export type PaymentData = {
  ref: string
  userId: string
  amountZAR: number
  currency?: string
  status: string
  createdAt: Date | firestore.Timestamp
  updatedAt?: Date | firestore.Timestamp
  creditedAt?: Date | firestore.Timestamp
  completedAt?: Date | firestore.Timestamp
  provider?: string
  payfastParams?: Record<string, any>
  [key: string]: any
}

/**
 * Create a slim projection of payment data for subcollection
 * Includes pointer to global doc for full data access
 */
function createPaymentProjection(paymentData: PaymentData): Record<string, any> {
  return {
    ref: paymentData.ref,
    userId: paymentData.userId,
    amountZAR: paymentData.amountZAR,
    currency: paymentData.currency || 'ZAR',
    status: paymentData.status,
    createdAt: paymentData.createdAt,
    updatedAt: paymentData.updatedAt || paymentData.createdAt,
    creditedAt: paymentData.creditedAt || null,
    completedAt: paymentData.completedAt || null,
    provider: paymentData.provider || 'payfast',
    // Pointer to global doc for full data access
    _globalDocPath: `payments/${paymentData.ref}`,
  }
}

/**
 * Upsert payment to both global collection and user subcollection
 * Idempotent: uses ref as doc ID everywhere
 */
export async function upsertPayment(
  db: firestore.Firestore,
  paymentData: PaymentData
): Promise<void> {
  const { ref, userId } = paymentData

  if (!ref || !userId) {
    throw new Error('Payment ref and userId are required')
  }

  // Create slim projection for subcollection
  const projection = createPaymentProjection(paymentData)

  // Use batch write for atomicity
  const batch = db.batch()

  // Write to global collection (full data)
  const globalRef = db.collection('payments').doc(ref)
  batch.set(globalRef, {
    ...paymentData,
    updatedAt: paymentData.updatedAt || new Date(),
  }, { merge: true }) // Merge for idempotent upserts

  // Write to user subcollection (slim projection)
  const userRef = db.collection('users').doc(userId).collection('payments').doc(ref)
  batch.set(userRef, {
    ...projection,
    updatedAt: projection.updatedAt || new Date(),
  }, { merge: true }) // Merge for idempotent upserts

  try {
    await batch.commit()
    console.log('[Payment Mirror] Successfully mirrored payment', { ref, userId })
  } catch (error: any) {
    console.error('[Payment Mirror] Failed to mirror payment', {
      ref,
      userId,
      error: error.message,
    })
    // Don't throw - allow payment creation to succeed even if mirroring fails
    // The fallback query will still work
  }
}

/**
 * Update payment status in both collections
 * Idempotent: uses ref as doc ID
 */
export async function updatePaymentStatus(
  db: firestore.Firestore,
  ref: string,
  userId: string,
  updates: {
    status?: string
    creditedAt?: Date | firestore.Timestamp
    completedAt?: Date | firestore.Timestamp
    [key: string]: any
  }
): Promise<void> {
  if (!ref || !userId) {
    throw new Error('Payment ref and userId are required')
  }

  const batch = db.batch()
  const now = new Date()

  // Update global collection
  const globalRef = db.collection('payments').doc(ref)
  batch.update(globalRef, {
    ...updates,
    updatedAt: now,
  })

  // Update user subcollection (slim projection)
  const userRef = db.collection('users').doc(userId).collection('payments').doc(ref)
  batch.update(userRef, {
    ...updates,
    updatedAt: now,
  })

  try {
    await batch.commit()
    console.log('[Payment Mirror] Successfully updated payment status', { ref, userId, updates })
  } catch (error: any) {
    console.error('[Payment Mirror] Failed to update payment status', {
      ref,
      userId,
      updates,
      error: error.message,
    })
    // Don't throw - allow status update to succeed even if mirroring fails
  }
}


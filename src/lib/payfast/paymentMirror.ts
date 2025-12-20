/**
 * Payment Mirroring Utility
 * Centralized function to mirror payments to user subcollection
 * Used by all payment write operations for consistency
 */

import type { firestore } from 'firebase-admin'
import * as admin from 'firebase-admin'

/**
 * Convert Date or Timestamp to Firestore Timestamp
 */
function toFirestoreTimestamp(value: Date | firestore.Timestamp | null | undefined): firestore.Timestamp | null {
  if (!value) return null
  if (value instanceof Date) {
    return admin.firestore.Timestamp.fromDate(value)
  }
  if (value instanceof admin.firestore.Timestamp) {
    return value
  }
  // If it's already a Firestore Timestamp from admin SDK
  return value as firestore.Timestamp
}

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
  const now = admin.firestore.Timestamp.now()
  return {
    ref: paymentData.ref,
    userId: paymentData.userId,
    amountZAR: paymentData.amountZAR,
    currency: paymentData.currency || 'ZAR',
    status: paymentData.status,
    createdAt: toFirestoreTimestamp(paymentData.createdAt) || now,
    updatedAt: toFirestoreTimestamp(paymentData.updatedAt) || toFirestoreTimestamp(paymentData.createdAt) || now,
    creditedAt: toFirestoreTimestamp(paymentData.creditedAt),
    completedAt: toFirestoreTimestamp(paymentData.completedAt),
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
  const now = admin.firestore.Timestamp.now()

  // Normalize timestamps for global collection
  const globalData: Record<string, any> = {
    ...paymentData,
    createdAt: toFirestoreTimestamp(paymentData.createdAt) || now,
    updatedAt: toFirestoreTimestamp(paymentData.updatedAt) || now,
  }
  if (paymentData.creditedAt) {
    globalData.creditedAt = toFirestoreTimestamp(paymentData.creditedAt)
  }
  if (paymentData.completedAt) {
    globalData.completedAt = toFirestoreTimestamp(paymentData.completedAt)
  }

  // Write to global collection (full data)
  const globalRef = db.collection('payments').doc(ref)
  batch.set(globalRef, globalData, { merge: true }) // Merge for idempotent upserts

  // Write to user subcollection (slim projection)
  const userRef = db.collection('users').doc(userId).collection('payments').doc(ref)
  batch.set(userRef, projection, { merge: true }) // Merge for idempotent upserts

  try {
    await batch.commit()
    console.log('[Payment Mirror] Successfully mirrored payment', {
      ref,
      userId,
      wroteGlobal: true,
      wroteUserSubcollection: true,
    })
  } catch (error: any) {
    console.error('[Payment Mirror] Failed to mirror payment', {
      ref,
      userId,
      error: error.message,
      wroteGlobal: false,
      wroteUserSubcollection: false,
    })
    // Throw to ensure payment creation fails if mirroring fails (atomicity)
    throw error
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
  const now = admin.firestore.Timestamp.now()

  // Normalize timestamps in updates
  const normalizedUpdates: Record<string, any> = {
    ...updates,
    updatedAt: now,
  }
  if (updates.creditedAt) {
    normalizedUpdates.creditedAt = toFirestoreTimestamp(updates.creditedAt)
  }
  if (updates.completedAt) {
    normalizedUpdates.completedAt = toFirestoreTimestamp(updates.completedAt)
  }

  // Update global collection
  const globalRef = db.collection('payments').doc(ref)
  batch.update(globalRef, normalizedUpdates)

  // Update user subcollection (slim projection - only relevant fields)
  const userRef = db.collection('users').doc(userId).collection('payments').doc(ref)
  const subcollectionUpdates: Record<string, any> = {
    status: normalizedUpdates.status,
    updatedAt: now,
  }
  if (normalizedUpdates.creditedAt) {
    subcollectionUpdates.creditedAt = normalizedUpdates.creditedAt
  }
  if (normalizedUpdates.completedAt) {
    subcollectionUpdates.completedAt = normalizedUpdates.completedAt
  }
  batch.update(userRef, subcollectionUpdates)

  try {
    await batch.commit()
    console.log('[Payment Mirror] Successfully updated payment status', {
      ref,
      userId,
      status: updates.status,
      wroteGlobal: true,
      wroteUserSubcollection: true,
    })
  } catch (error: any) {
    console.error('[Payment Mirror] Failed to update payment status', {
      ref,
      userId,
      updates,
      error: error.message,
      wroteGlobal: false,
      wroteUserSubcollection: false,
    })
    // Throw to ensure status update fails if mirroring fails (atomicity)
    throw error
  }
}


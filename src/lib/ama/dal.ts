/**
 * Ama Data Access Layer (DAL)
 * Strict user-scoped data access functions
 * All queries are scoped to uid unless explicitly admin
 */

import type { firestore } from 'firebase-admin'

export type AccessMode = 'USER' | 'ADMIN'

/**
 * Get user wallets (USER mode only - scoped to uid)
 */
export async function getUserWallets(
  db: firestore.Firestore,
  uid: string
): Promise<Record<string, any>> {
  const walletsRef = db.collection('users').doc(uid).collection('wallets')
  const snapshot = await walletsRef.get()
  
  const wallets: Record<string, any> = {}
  snapshot.forEach((doc) => {
    const data = doc.data()
    wallets[doc.id] = {
      walletId: doc.id,
      ...data,
      // Convert Firestore timestamps to ISO strings
      createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
    }
  })
  
  return wallets
}

/**
 * Get user profile (USER mode only - scoped to uid)
 */
export async function getUserProfile(
  db: firestore.Firestore,
  uid: string
): Promise<Record<string, any> | null> {
  const userRef = db.collection('users').doc(uid)
  const userDoc = await userRef.get()
  
  if (!userDoc.exists) {
    return null
  }
  
  const data = userDoc.data()!
  return {
    userId: uid,
    ...data,
    // Convert Firestore timestamps
    createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
  }
}

/**
 * Get payment by reference (USER mode - must verify payment.userId === uid)
 */
export async function getPaymentByRef(
  db: firestore.Firestore,
  uid: string,
  ref: string
): Promise<Record<string, any> | null> {
  const paymentRef = db.collection('payments').doc(ref)
  const paymentDoc = await paymentRef.get()
  
  if (!paymentDoc.exists) {
    return null
  }
  
  const data = paymentDoc.data()!
  
  // Verify payment belongs to user
  if (data.userId !== uid) {
    throw new Error('Payment does not belong to user')
  }
  
  return {
    ref: paymentDoc.id,
    ...data,
    // Convert Firestore timestamps
    createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
    updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
    creditedAt: data.creditedAt?.toDate?.()?.toISOString() || null,
    completedAt: data.completedAt?.toDate?.()?.toISOString() || null,
  }
}

/**
 * List recent payments for user (USER mode - scoped to uid)
 */
export async function listRecentPayments(
  db: firestore.Firestore,
  uid: string,
  limit: number = 20
): Promise<Array<Record<string, any>>> {
  const paymentsRef = db.collection('payments')
  const snapshot = await paymentsRef
    .where('userId', '==', uid)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get()
  
  const payments: Array<Record<string, any>> = []
  snapshot.forEach((doc) => {
    const data = doc.data()
    payments.push({
      ref: doc.id,
      ...data,
      // Convert Firestore timestamps
      createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
      creditedAt: data.creditedAt?.toDate?.()?.toISOString() || null,
      completedAt: data.completedAt?.toDate?.()?.toISOString() || null,
    })
  })
  
  return payments
}

/**
 * Search transactions for user (USER mode - scoped to uid)
 */
export async function searchTransactions(
  db: firestore.Firestore,
  uid: string,
  query: {
    status?: string
    type?: string
    limit?: number
  }
): Promise<Array<Record<string, any>>> {
  let transactionsRef = db.collection('transactions')
    .where('participants', 'array-contains', uid)
  
  if (query.status) {
    transactionsRef = transactionsRef.where('status', '==', query.status) as any
  }
  
  if (query.type) {
    transactionsRef = transactionsRef.where('type', '==', query.type) as any
  }
  
  const limit = query.limit || 20
  const snapshot = await transactionsRef
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get()
  
  const transactions: Array<Record<string, any>> = []
  snapshot.forEach((doc) => {
    const data = doc.data()
    transactions.push({
      txId: doc.id,
      ...data,
      // Convert Firestore timestamps
      createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
      statusUpdatedAt: data.statusUpdatedAt?.toDate?.()?.toISOString() || null,
    })
  })
  
  return transactions
}

/**
 * Admin: Get user by handle (ADMIN only)
 */
export async function adminGetUserByHandle(
  db: firestore.Firestore,
  handle: string
): Promise<Record<string, any> | null> {
  const usersRef = db.collection('users')
  const snapshot = await usersRef.where('handle', '==', handle).limit(1).get()
  
  if (snapshot.empty) {
    return null
  }
  
  const doc = snapshot.docs[0]
  const data = doc.data()
  
  return {
    userId: doc.id,
    ...data,
    // Redact sensitive fields
    email: data.email ? `${data.email.split('@')[0]}@***` : null, // Partial email
    phoneNumber: data.phoneNumber ? '***' : null, // Redact phone
    createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
  }
}

/**
 * Admin: Search payments (ADMIN only - returns summary, not full dump)
 */
export async function adminSearchPayments(
  db: firestore.Firestore,
  query: {
    status?: string
    userId?: string
    limit?: number
  }
): Promise<Array<Record<string, any>>> {
  let paymentsRef = db.collection('payments')
  
  if (query.status) {
    paymentsRef = paymentsRef.where('status', '==', query.status) as any
  }
  
  if (query.userId) {
    paymentsRef = paymentsRef.where('userId', '==', query.userId) as any
  }
  
  const limit = Math.min(query.limit || 20, 50) // Cap at 50 for admin safety
  const snapshot = await paymentsRef
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get()
  
  const payments: Array<Record<string, any>> = []
  snapshot.forEach((doc) => {
    const data = doc.data()
    // Return summary only (not full payment data)
    payments.push({
      ref: doc.id,
      userId: data.userId,
      status: data.status,
      amountZAR: data.amountZAR,
      currency: data.currency,
      createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
      // Exclude sensitive fields like payfastPaymentId, full payfastData, etc.
    })
  })
  
  return payments
}

/**
 * Redact sensitive data from tool outputs
 */
export function redactSensitiveData(data: any): any {
  if (typeof data !== 'object' || data === null) {
    return data
  }
  
  if (Array.isArray(data)) {
    return data.map(redactSensitiveData)
  }
  
  const redacted: Record<string, any> = {}
  const sensitiveKeys = [
    'private_key',
    'privateKey',
    'api_key',
    'apiKey',
    'access_token',
    'accessToken',
    'secret',
    'password',
    'token',
  ]
  
  for (const [key, value] of Object.entries(data)) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
      redacted[key] = '***REDACTED***'
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactSensitiveData(value)
    } else {
      redacted[key] = value
    }
  }
  
  return redacted
}


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
 * Map Firestore errors to user-friendly messages
 */
function mapFirestoreError(error: any): Error {
  // Missing index error
  if (error.code === 9 || error.message?.includes('index') || error.message?.includes('FAILED_PRECONDITION')) {
    const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || 'gobankless-dev'
    const indexUrl = `https://console.firebase.google.com/project/${projectId}/firestore/indexes`
    return new Error(
      `Payments query requires a Firestore index. Please create the index: ` +
      `Collection: payments, Fields: userId (Ascending), createdAt (Descending). ` +
      `Or visit: ${indexUrl}`
    )
  }

  // Permission denied
  if (error.code === 7 || error.message?.includes('permission') || error.message?.includes('PERMISSION_DENIED')) {
    return new Error('You do not have permission to access this data.')
  }

  // Not found
  if (error.code === 5 || error.message?.includes('not found') || error.message?.includes('NOT_FOUND')) {
    return new Error('Payment data not found.')
  }

  // Generic error (don't expose raw Firestore errors)
  return new Error('Unable to fetch payment data. Please try again later.')
}

/**
 * List recent payments for user (USER mode - scoped to uid)
 * Reads ONLY from users/{uid}/payments subcollection (canonical read model)
 * Returns empty array if subcollection is empty (no fallback, no error)
 */
export async function listRecentPayments(
  db: firestore.Firestore,
  uid: string,
  limit: number = 20
): Promise<Array<Record<string, any>>> {
  // Query subcollection only (canonical read model - no fallback)
  try {
    const subcollectionRef = db.collection('users').doc(uid).collection('payments')
    const subcollectionSnapshot = await subcollectionRef
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get()
    
    const payments: Array<Record<string, any>> = []
    subcollectionSnapshot.forEach((doc) => {
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
    
    // Log query result (dev-only)
    if (process.env.NODE_ENV !== 'production') {
      console.log('[DAL] listRecentPayments query result', {
        uid,
        limit,
        foundSubcollectionDocs: payments.length,
        isEmpty: payments.length === 0,
      })
    }
    
    // Return empty array if no payments found (expected state, not an error)
    return payments
  } catch (error: any) {
    // Log query error
    console.error('[DAL] listRecentPayments query failed', {
      uid,
      limit,
      error: error.message,
    })
    // Map Firestore errors to user-friendly messages
    throw mapFirestoreError(error)
  }
}

/**
 * Get user snapshot (profile + wallets + recent payments)
 * Returns empty array for recentPayments if unavailable (does not hard-fail)
 */
export async function getUserSnapshot(
  db: firestore.Firestore,
  uid: string
): Promise<{
  profile: Record<string, any> | null
  wallets: Array<Record<string, any>>
  recentPayments: Array<Record<string, any>>
}> {
  // Fetch profile (may be null)
  const profile = await getUserProfile(db, uid)
  
  // Fetch wallets
  const walletsMap = await getUserWallets(db, uid)
  const wallets = Object.entries(walletsMap).map(([walletId, data]) => ({
    walletId,
    ...data,
  }))
  
  // Fetch recent payments (gracefully handle failures)
  let recentPayments: Array<Record<string, any>> = []
  try {
    recentPayments = await listRecentPayments(db, uid, 5) // Last 5 payments
  } catch (error: any) {
    // If payments query fails (e.g., missing index), return empty array
    console.warn('[DAL] getUserSnapshot: Failed to fetch payments, returning empty array:', error.message)
    recentPayments = []
  }
  
  return {
    profile,
    wallets,
    recentPayments,
  }
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
 * Admin: Get user by UID (ADMIN only - returns profile + wallets + last 20 payments/tx summary)
 */
export async function adminGetUserByUid(
  db: firestore.Firestore,
  targetUid: string
): Promise<Record<string, any> | null> {
  // Get user profile
  const userRef = db.collection('users').doc(targetUid)
  const userDoc = await userRef.get()
  
  if (!userDoc.exists) {
    return null
  }
  
  const userData = userDoc.data()!
  
  // Get wallets
  const walletsRef = userRef.collection('wallets')
  const walletsSnapshot = await walletsRef.get()
  const wallets: Record<string, any> = {}
  walletsSnapshot.forEach((doc) => {
    const data = doc.data()
    wallets[doc.id] = {
      walletId: doc.id,
      displayCurrency: data.displayCurrency,
      fiatBalance: data.fiatBalance,
      usdtBalance: data.usdtBalance,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
    }
  })
  
  // Get last 20 payments
  const paymentsRef = db.collection('payments')
  const paymentsSnapshot = await paymentsRef
    .where('userId', '==', targetUid)
    .orderBy('createdAt', 'desc')
    .limit(20)
    .get()
  
  const payments: Array<Record<string, any>> = []
  paymentsSnapshot.forEach((doc) => {
    const data = doc.data()
    payments.push({
      ref: doc.id,
      status: data.status,
      amountZAR: data.amountZAR,
      currency: data.currency,
      createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
    })
  })
  
  return {
    userId: targetUid,
    handle: userData.handle,
    email: userData.email ? `${userData.email.split('@')[0]}@***` : null, // Partial email
    createdAt: userData.createdAt?.toDate?.()?.toISOString() || null,
    wallets,
    recentPayments: payments,
  }
}

/**
 * Admin: Get document by explicit path (ADMIN only - max 50KB response)
 */
export async function adminGetDocByPath(
  db: firestore.Firestore,
  path: string
): Promise<Record<string, any> | null> {
  // Validate path format (must be collection/doc or collection/doc/subcollection/doc)
  if (!path || typeof path !== 'string') {
    throw new Error('Invalid path: must be a non-empty string')
  }
  
  // Block wildcard paths
  if (path.includes('*') || path.includes('{') || path.includes('}')) {
    throw new Error('Invalid path: wildcards not allowed')
  }
  
  // Block root-level access to sensitive collections
  const blockedRoots = ['_secrets', '_admin', '_config']
  const firstSegment = path.split('/')[0]
  if (blockedRoots.includes(firstSegment)) {
    throw new Error('Access to this collection is blocked')
  }
  
  try {
    const docRef = db.doc(path)
    const doc = await docRef.get()
    
    if (!doc.exists) {
      return null
    }
    
    const data = doc.data()!
    
    // Check response size (50KB limit)
    const dataString = JSON.stringify(data)
    if (dataString.length > 50 * 1024) {
      return {
        error: 'Document too large',
        size: dataString.length,
        maxSize: 50 * 1024,
        path,
      }
    }
    
    return {
      path: doc.ref.path,
      ...data,
      // Convert Firestore timestamps
      createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
    }
  } catch (error: any) {
    throw new Error(`Failed to get document: ${error.message}`)
  }
}

/**
 * Admin: Query collection (ADMIN only - require limit, block wildcard paths)
 */
export async function adminQueryCollection(
  db: firestore.Firestore,
  query: {
    collectionPath: string
    where?: Array<{ field: string; operator: string; value: any }>
    orderBy?: { field: string; direction?: 'asc' | 'desc' }
    limit: number
  }
): Promise<Array<Record<string, any>>> {
  // Validate collection path
  if (!query.collectionPath || typeof query.collectionPath !== 'string') {
    throw new Error('Invalid collectionPath: must be a non-empty string')
  }
  
  // Block wildcard paths
  if (query.collectionPath.includes('*') || query.collectionPath.includes('{') || query.collectionPath.includes('}')) {
    throw new Error('Invalid collectionPath: wildcards not allowed')
  }
  
  // Block root-level access to sensitive collections
  const blockedRoots = ['_secrets', '_admin', '_config']
  const firstSegment = query.collectionPath.split('/')[0]
  if (blockedRoots.includes(firstSegment)) {
    throw new Error('Access to this collection is blocked')
  }
  
  // Require limit (max 50)
  const limit = Math.min(query.limit || 20, 50)
  if (limit < 1) {
    throw new Error('limit must be at least 1')
  }
  
  try {
    let collectionRef = db.collection(query.collectionPath) as any
    
    // Apply where clauses
    if (query.where && Array.isArray(query.where)) {
      for (const condition of query.where) {
        if (condition.field && condition.operator && condition.value !== undefined) {
          collectionRef = collectionRef.where(condition.field, condition.operator, condition.value)
        }
      }
    }
    
    // Apply orderBy
    if (query.orderBy && query.orderBy.field) {
      collectionRef = collectionRef.orderBy(
        query.orderBy.field,
        query.orderBy.direction || 'asc'
      )
    }
    
    // Apply limit
    collectionRef = collectionRef.limit(limit)
    
    const snapshot = await collectionRef.get()
    
    const results: Array<Record<string, any>> = []
    snapshot.forEach((doc: firestore.QueryDocumentSnapshot) => {
      const data = doc.data()
      results.push({
        id: doc.id,
        ...data,
        // Convert Firestore timestamps
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
      })
    })
    
    return results
  } catch (error: any) {
    throw new Error(`Failed to query collection: ${error.message}`)
  }
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


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
 * Tries subcollection first (no index needed), falls back to main collection with composite index
 */
export async function listRecentPayments(
  db: firestore.Firestore,
  uid: string,
  limit: number = 20
): Promise<Array<Record<string, any>>> {
  // Try subcollection first (users/{uid}/payments) - no composite index needed
  try {
    const subcollectionRef = db.collection('users').doc(uid).collection('payments')
    const subcollectionSnapshot = await subcollectionRef
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get()
    
    if (!subcollectionSnapshot.empty) {
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
      return payments
    }
  } catch (subcollectionError: any) {
    // Subcollection doesn't exist or query failed - fall through to main collection
    console.log('[DAL] Subcollection query failed, trying main collection:', subcollectionError.message)
  }
  
  // Fallback: Query main payments collection (requires composite index)
  try {
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
  } catch (error: any) {
    // Check if it's a missing index error
    if (error.code === 9 || error.message?.includes('index') || error.message?.includes('FAILED_PRECONDITION')) {
      const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || 'gobankless-dev'
      const indexUrl = `https://console.firebase.google.com/project/${projectId}/firestore/indexes`
      throw new Error(
        `Payments query requires a Firestore index. Please create the index: ` +
        `Collection: payments, Fields: userId (Ascending), createdAt (Descending). ` +
        `Or visit: ${indexUrl}`
      )
    }
    throw error
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


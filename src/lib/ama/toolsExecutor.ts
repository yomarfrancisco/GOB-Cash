/**
 * Ama Tools Executor
 * Direct function execution (no HTTP calls)
 * Used by router and API route
 */

import { getAdminDb } from '@/lib/firebaseAdmin'
import * as dal from '@/lib/ama/dal'

export type ToolName =
  | 'get_user_wallets'
  | 'get_user_profile'
  | 'get_user_snapshot'
  | 'get_payment_by_ref'
  | 'list_recent_payments'
  | 'search_transactions'
  | 'admin_get_user_by_handle'
  | 'admin_search_payments'
  | 'admin_get_user_by_uid'
  | 'admin_get_doc_by_path'
  | 'admin_query_collection'
  | 'debug_whoami'

export type ExecuteToolParams = {
  uid: string
  isAdmin: boolean
  toolName: ToolName
  args: Record<string, any>
}

export type ToolResult = {
  ok: true
  data: any
} | {
  ok: false
  error: string
  status: number
  errorType?: string // e.g., 'NOT_SYNCED'
}

/**
 * Execute a tool directly (no HTTP)
 */
export async function executeTool(params: ExecuteToolParams): Promise<ToolResult> {
  const { uid, isAdmin, toolName, args } = params

  try {
    const db = getAdminDb()
    let result: any

    switch (toolName) {
      case 'get_user_wallets':
        result = await dal.getUserWallets(db, uid)
        break

      case 'get_user_profile':
        result = await dal.getUserProfile(db, uid)
        break

      case 'get_user_snapshot':
        result = await dal.getUserSnapshot(db, uid)
        break

      case 'get_payment_by_ref':
        if (!args.ref || typeof args.ref !== 'string') {
          return { ok: false, error: 'ref is required', status: 400 }
        }
        result = await dal.getPaymentByRef(db, uid, args.ref)
        break

      case 'list_recent_payments':
        const limit = args.limit ? Math.min(Number(args.limit), 50) : 20
        result = await dal.listRecentPayments(db, uid, limit)
        // Returns empty array if subcollection is empty (expected state, not an error)
        break

      case 'search_transactions':
        result = await dal.searchTransactions(db, uid, {
          status: args.status,
          type: args.type,
          limit: args.limit ? Math.min(Number(args.limit), 50) : 20,
        })
        break

      case 'admin_get_user_by_handle':
        if (!isAdmin) {
          return { ok: false, error: 'Admin access required', status: 403 }
        }
        if (!args.handle || typeof args.handle !== 'string') {
          return { ok: false, error: 'handle is required', status: 400 }
        }
        result = await dal.adminGetUserByHandle(db, args.handle)
        break

      case 'admin_search_payments':
        if (!isAdmin) {
          return { ok: false, error: 'Admin access required', status: 403 }
        }
        result = await dal.adminSearchPayments(db, {
          status: args.status,
          userId: args.userId,
          limit: args.limit ? Math.min(Number(args.limit), 50) : 20,
        })
        break

      case 'admin_get_user_by_uid':
        if (!isAdmin) {
          return { ok: false, error: 'Admin access required', status: 403 }
        }
        if (!args.uid || typeof args.uid !== 'string') {
          return { ok: false, error: 'uid is required', status: 400 }
        }
        console.log('[Ama Tool Executor] Admin tool: admin_get_user_by_uid', { uid: args.uid, callerUid: uid })
        result = await dal.adminGetUserByUid(db, args.uid)
        break

      case 'admin_get_doc_by_path':
        if (!isAdmin) {
          return { ok: false, error: 'Admin access required', status: 403 }
        }
        if (!args.path || typeof args.path !== 'string') {
          return { ok: false, error: 'path is required', status: 400 }
        }
        console.log('[Ama Tool Executor] Admin tool: admin_get_doc_by_path', { path: args.path, callerUid: uid })
        result = await dal.adminGetDocByPath(db, args.path)
        break

      case 'admin_query_collection':
        if (!isAdmin) {
          return { ok: false, error: 'Admin access required', status: 403 }
        }
        if (!args.collectionPath || typeof args.collectionPath !== 'string') {
          return { ok: false, error: 'collectionPath is required', status: 400 }
        }
        if (!args.limit || typeof args.limit !== 'number' || args.limit < 1) {
          return { ok: false, error: 'limit is required and must be at least 1', status: 400 }
        }
        console.log('[Ama Tool Executor] Admin tool: admin_query_collection', { 
          collectionPath: args.collectionPath, 
          limit: args.limit,
          callerUid: uid 
        })
        result = await dal.adminQueryCollection(db, {
          collectionPath: args.collectionPath,
          where: args.where,
          orderBy: args.orderBy,
          limit: args.limit,
        })
        break

      case 'debug_whoami':
        // Lightweight health/debug tool
        const userDoc = await dal.getUserProfile(db, uid)
        result = {
          uid,
          email: userDoc?.email || null,
          isAdmin,
          projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || null,
        }
        break

      default:
        return { ok: false, error: `Unknown tool: ${toolName}`, status: 400 }
    }

    // Redact sensitive data
    const redactedResult = dal.redactSensitiveData(result)

    // Limit response size (safety check)
    const resultString = JSON.stringify(redactedResult)
    if (resultString.length > 100000) { // 100KB limit
      console.warn('[Ama Tool Executor] Response too large, truncating', { toolName, size: resultString.length })
      return {
        ok: true,
        data: { error: 'Response too large', truncated: true },
      }
    }

    return {
      ok: true,
      data: redactedResult,
    }
  } catch (error: any) {
    // Log actual errors
    console.error('[Ama Tool Executor] Error:', error)
    
    return {
      ok: false,
      error: error.message || 'Tool execution failed',
      status: 500,
    }
  }
}


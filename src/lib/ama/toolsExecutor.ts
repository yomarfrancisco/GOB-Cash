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
  | 'get_payment_by_ref'
  | 'list_recent_payments'
  | 'search_transactions'
  | 'admin_get_user_by_handle'
  | 'admin_search_payments'
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

      case 'get_payment_by_ref':
        if (!args.ref || typeof args.ref !== 'string') {
          return { ok: false, error: 'ref is required', status: 400 }
        }
        result = await dal.getPaymentByRef(db, uid, args.ref)
        break

      case 'list_recent_payments':
        const limit = args.limit ? Math.min(Number(args.limit), 50) : 20
        result = await dal.listRecentPayments(db, uid, limit)
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
    console.error('[Ama Tool Executor] Error:', error)
    return {
      ok: false,
      error: error.message || 'Tool execution failed',
      status: 500,
    }
  }
}


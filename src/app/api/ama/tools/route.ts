/**
 * Ama Tools API Route
 * Server-side tool execution for LLM
 * All tools are user-scoped unless admin mode
 */

import { NextRequest, NextResponse } from 'next/server'
import { getDb, getAuth } from '@/lib/firebase-admin'
import * as dal from '@/lib/ama/dal'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ToolName =
  | 'get_user_wallets'
  | 'get_user_profile'
  | 'get_payment_by_ref'
  | 'list_recent_payments'
  | 'search_transactions'
  | 'admin_get_user_by_handle'
  | 'admin_search_payments'

interface ToolRequest {
  tool: ToolName
  args: Record<string, any>
}

/**
 * Check if user is admin
 * Hardened parsing: split, trim, filter empty strings
 */
function isAdmin(uid: string, adminUids: string[]): boolean {
  return adminUids.includes(uid)
}

/**
 * Verify Firebase Auth token and get uid
 */
async function verifyAuth(request: NextRequest): Promise<{ uid: string; isAdmin: boolean; adminUids: string[] }> {
  const authHeader = request.headers.get('authorization')
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid authorization header')
  }
  
  const token = authHeader.substring(7)
  const auth = getAuth()
  
  try {
    const decodedToken = await auth.verifyIdToken(token)
    const uid = decodedToken.uid
    
    // Harden env parsing: split, trim, filter empty strings
    const adminUids = (process.env.AMA_ADMIN_UIDS || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
    
    const admin = isAdmin(uid, adminUids)
    
    // Safe debug logs (no secrets)
    console.log('[Ama Tools] uid:', uid)
    console.log('[Ama Tools] adminUIDs:', adminUids)
    console.log('[Ama Tools] isAdmin:', admin)
    console.log('[Ama Tools] has FIREBASE_ADMIN_PRIVATE_KEY:', Boolean(process.env.FIREBASE_ADMIN_PRIVATE_KEY))
    console.log('[Ama Tools] project:', process.env.FIREBASE_ADMIN_PROJECT_ID)
    console.log('[Ama Tools] clientEmail:', process.env.FIREBASE_ADMIN_CLIENT_EMAIL)
    
    return { uid, isAdmin: admin, adminUids }
  } catch (error: any) {
    throw new Error(`Invalid auth token: ${error.message}`)
  }
}

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const { uid, isAdmin } = await verifyAuth(request)
    
    // Parse request body
    const body: ToolRequest = await request.json()
    const { tool, args } = body
    
    if (!tool || typeof tool !== 'string') {
      return NextResponse.json({ error: 'tool is required' }, { status: 400 })
    }
    
    // Log tool call
    console.log('[Ama Tool]', {
      uid,
      admin: isAdmin,
      tool,
      args: JSON.stringify(args).substring(0, 200), // Truncate for logging
    })
    
    // Get database instance
    const db = getDb()
    
    // Execute tool based on name
    let result: any
    
    switch (tool) {
      case 'get_user_wallets':
        result = await dal.getUserWallets(db, uid)
        break
        
      case 'get_user_profile':
        result = await dal.getUserProfile(db, uid)
        break
        
      case 'get_payment_by_ref':
        if (!args.ref || typeof args.ref !== 'string') {
          return NextResponse.json({ error: 'ref is required' }, { status: 400 })
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
          return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
        }
        if (!args.handle || typeof args.handle !== 'string') {
          return NextResponse.json({ error: 'handle is required' }, { status: 400 })
        }
        result = await dal.adminGetUserByHandle(db, args.handle)
        break
        
      case 'admin_search_payments':
        if (!isAdmin) {
          return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
        }
        result = await dal.adminSearchPayments(db, {
          status: args.status,
          userId: args.userId,
          limit: args.limit ? Math.min(Number(args.limit), 50) : 20,
        })
        break
        
      default:
        return NextResponse.json({ error: `Unknown tool: ${tool}` }, { status: 400 })
    }
    
    // Redact sensitive data
    const redactedResult = dal.redactSensitiveData(result)
    
    // Limit response size (safety check)
    const resultString = JSON.stringify(redactedResult)
    if (resultString.length > 100000) { // 100KB limit
      console.warn('[Ama Tool] Response too large, truncating', { tool, size: resultString.length })
      return NextResponse.json({
        ok: true,
        data: { error: 'Response too large', truncated: true },
        size: resultString.length,
      })
    }
    
    return NextResponse.json({
      ok: true,
      data: redactedResult,
    })
  } catch (error: any) {
    console.error('[Ama Tool] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Tool execution failed' },
      { status: 500 }
    )
  }
}


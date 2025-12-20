/**
 * Ama Tools API Route
 * Server-side tool execution for LLM
 * Thin wrapper: verify token → call executeTool(...)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminAuth } from '@/lib/firebaseAdmin'
import { executeTool, type ToolName } from '@/lib/ama/toolsExecutor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

export async function POST(request: NextRequest) {
  try {
    // Parse request body first (may contain authToken for alternative auth)
    const body: ToolRequest & { authToken?: string } = await request.json()
    const { tool, args, authToken: bodyAuthToken } = body

    if (!tool || typeof tool !== 'string') {
      return NextResponse.json({ error: 'tool is required' }, { status: 400 })
    }

    // Get token from header or body (body for internal calls)
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.startsWith('Bearer ') 
      ? authHeader.substring(7)
      : bodyAuthToken || null

    // Hard, visible diagnostics
    console.log('[AMA_TOOLS] token present:', Boolean(token))
    if (!token) {
      return NextResponse.json(
        { error: 'Missing authToken', detail: 'No token in Authorization header or request body' },
        { status: 401 }
      )
    }

    // Verify token
    let decoded
    try {
      const auth = getAdminAuth()
      decoded = await auth.verifyIdToken(token)
      console.log('[AMA_TOOLS] verifyIdToken success, uid:', decoded.uid)
    } catch (e: any) {
      console.error('[AMA_TOOLS] verifyIdToken failed:', e?.message)
      const errorDetail = process.env.NODE_ENV !== 'production' ? e?.message : undefined
      return NextResponse.json(
        { error: 'verifyIdToken failed', detail: errorDetail },
        { status: 401 }
      )
    }

    const uid = decoded.uid

    // Harden env parsing: split, trim, filter empty strings
    const adminUids = (process.env.AMA_ADMIN_UIDS || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)

    const admin = isAdmin(uid, adminUids)

    // Safe debug logs (no secrets)
    console.log('[AMA_TOOLS] uid:', uid)
    console.log('[AMA_TOOLS] adminUIDs:', adminUids)
    console.log('[AMA_TOOLS] isAdmin:', admin)
    console.log('[AMA_TOOLS] has FIREBASE_ADMIN_PRIVATE_KEY:', Boolean(process.env.FIREBASE_ADMIN_PRIVATE_KEY))
    console.log('[AMA_TOOLS] project:', process.env.FIREBASE_ADMIN_PROJECT_ID)
    console.log('[AMA_TOOLS] clientEmail:', process.env.FIREBASE_ADMIN_CLIENT_EMAIL)

    // Log tool call
    console.log('[AMA_TOOLS] Executing tool', {
      uid,
      admin,
      tool,
      args: JSON.stringify(args).substring(0, 200),
    })

    // Execute tool directly (no HTTP call)
    const result = await executeTool({
      uid,
      isAdmin: admin,
      toolName: tool,
      args: args || {},
    })

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      )
    }

    return NextResponse.json({
      ok: true,
      data: result.data,
    })
  } catch (error: any) {
    console.error('[AMA_TOOLS] Error:', error)
    const errorDetail = process.env.NODE_ENV !== 'production' ? error.message : undefined
    return NextResponse.json(
      { error: error.message || 'Tool execution failed', detail: errorDetail },
      { status: 500 }
    )
  }
}


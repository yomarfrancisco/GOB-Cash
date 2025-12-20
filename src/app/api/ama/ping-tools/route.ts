/**
 * Ama Ping Tools Endpoint
 * Debug endpoint to validate end-to-end tool execution from browser
 * Verifies auth token and runs get_user_wallets
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminAuth } from '@/lib/firebaseAdmin'
import { extractBearerToken } from '@/lib/ama/auth'
import { executeTool } from '@/lib/ama/toolsExecutor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    // Extract token (handles header casing variations + body fallback)
    let body: any = {}
    try {
      body = await request.json().catch(() => ({}))
    } catch {
      // Not JSON or no body - that's fine for GET
    }
    
    const token = extractBearerToken(request, body)
    
    if (!token) {
      return NextResponse.json(
        {
          ok: false,
          error: 'missing_id_token',
          hint: 'Pass Firebase ID token as Authorization: Bearer <JWT>',
        },
        { status: 401 }
      )
    }
    
    // Validate token format
    if (!token.startsWith('eyJ')) {
      return NextResponse.json(
        {
          ok: false,
          error: 'invalid_token_format',
          hint: 'Ensure token starts with eyJ... and is from getIdToken()',
        },
        { status: 401 }
      )
    }
    
    // Verify token
    let decoded
    try {
      const auth = getAdminAuth()
      decoded = await auth.verifyIdToken(token)
    } catch (e: any) {
      return NextResponse.json(
        {
          ok: false,
          error: 'verifyIdToken_failed',
          detail: e?.message?.substring(0, 200),
        },
        { status: 401 }
      )
    }
    
    const uid = decoded.uid
    
    // Execute get_user_wallets tool
    const toolResult = await executeTool({
      uid,
      isAdmin: false,
      toolName: 'get_user_wallets',
      args: {},
    })
    
    if (!toolResult.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: toolResult.error,
          status: toolResult.status,
        },
        { status: toolResult.status || 500 }
      )
    }
    
    const wallets = toolResult.data as Record<string, any>
    
    // Find cashZAR wallet
    let cashZAR: any = null
    for (const [walletId, walletData] of Object.entries(wallets)) {
      if (walletId === 'cashZAR' || walletData?.displayCurrency === 'ZAR') {
        cashZAR = walletData
        break
      }
    }
    
    // If no cashZAR found, check all wallets for ZAR currency
    if (!cashZAR) {
      for (const [walletId, walletData] of Object.entries(wallets)) {
        if (walletData?.displayCurrency === 'ZAR' || walletId.toLowerCase().includes('zar')) {
          cashZAR = walletData
          break
        }
      }
    }
    
    return NextResponse.json({
      ok: true,
      uid,
      hasCashZAR: Boolean(cashZAR),
      cashZARBalance: cashZAR?.fiatBalance || 0,
      walletsCount: Object.keys(wallets).length,
    })
  } catch (error: any) {
    console.error('[Ama Ping Tools] Error:', error)
    return NextResponse.json(
      {
        ok: false,
        error: error.message || 'Ping tools check failed',
      },
      { status: 500 }
    )
  }
}


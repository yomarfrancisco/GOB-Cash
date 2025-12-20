/**
 * Ama Whoami Debug Endpoint
 * Returns current user's UID, email, admin status, and Firebase project info
 * Admin-only endpoint for debugging authentication and admin gating
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminAuth } from '@/lib/firebaseAdmin'
import { extractBearerToken, getTokenDiagnostics } from '@/lib/ama/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    // Extract token (handles header casing variations + body fallback)
    let body: any = {}
    try {
      // Try to parse body if present (for POST requests or dev convenience)
      body = await request.json().catch(() => ({}))
    } catch {
      // Not JSON or no body - that's fine for GET
    }
    
    const token = extractBearerToken(request, body)
    
    // Log presence (not contents) of token sources
    const diagnostics = getTokenDiagnostics(request)
    console.log('[Ama Whoami] Authorization header present:', diagnostics.hasAuthorizationHeader || diagnostics.hasauthorizationHeader || diagnostics.hasAUTHORIZATIONHeader)
    console.log('[Ama Whoami] authToken in body present:', Boolean(body?.authToken || body?.token))
    
    if (!token) {
      return NextResponse.json(
        {
          error: 'missing_id_token',
          hint: 'Pass Firebase ID token as Authorization: Bearer <JWT>',
          diagnostics, // Include header presence diagnostics
        },
        { status: 401 }
      )
    }
    
    // Validate token format (should start with eyJ)
    if (!token.startsWith('eyJ')) {
      return NextResponse.json(
        {
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
      const errorMessage = e?.message || 'Unknown error'
      const truncatedDetail = errorMessage.length > 200 
        ? errorMessage.substring(0, 200) + '...' 
        : errorMessage
      
      console.error('[Ama Whoami] verifyIdToken failed:', truncatedDetail)
      return NextResponse.json(
        {
          error: 'verifyIdToken_failed',
          detail: truncatedDetail,
          hint: 'Ensure token starts with eyJ... and is from getIdToken()',
        },
        { status: 401 }
      )
    }

    const uid = decoded.uid
    const email = decoded.email || null

    // Parse admin UIDs
    const adminUids = (process.env.AMA_ADMIN_UIDS || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
    
    const isAdmin = adminUids.includes(uid)
    const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || 'unknown'

    return NextResponse.json({
      uid,
      email,
      isAdmin,
      adminUidsCount: adminUids.length,
      firebaseProjectId: projectId,
    })
  } catch (error: any) {
    console.error('[Ama Whoami] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Whoami check failed' },
      { status: 500 }
    )
  }
}


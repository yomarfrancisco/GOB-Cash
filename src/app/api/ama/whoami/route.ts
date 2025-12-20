/**
 * Ama Whoami Debug Endpoint
 * Returns current user's UID, email, admin status, and Firebase project info
 * Admin-only endpoint for debugging authentication and admin gating
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminAuth } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    // Get token from Authorization header (primary) or request body (dev convenience)
    const authHeader = request.headers.get('authorization')
    const hasAuthHeader = Boolean(authHeader && authHeader.startsWith('Bearer '))
    
    // Log presence (not contents) of token sources
    console.log('[Ama Whoami] Authorization header present:', hasAuthHeader)
    
    let token: string | null = null
    
    if (hasAuthHeader) {
      token = authHeader!.substring(7)
    } else {
      // Try to get from request body (for POST requests or dev convenience)
      try {
        const body = await request.json().catch(() => ({}))
        if (body.authToken && typeof body.authToken === 'string') {
          token = body.authToken
          console.log('[Ama Whoami] authToken in body present:', true)
        }
      } catch {
        // Not JSON or no body
      }
    }
    
    if (!token) {
      return NextResponse.json(
        {
          error: 'missing_id_token',
          hint: 'Pass Firebase ID token as Authorization: Bearer <JWT>',
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


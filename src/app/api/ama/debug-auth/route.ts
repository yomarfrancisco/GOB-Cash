/**
 * Ama Debug Auth Endpoint
 * Dev-only diagnostic endpoint for auth header debugging
 * Returns token presence info without exposing token contents
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
      body = await request.json().catch(() => ({}))
    } catch {
      // Not JSON or no body - that's fine for GET
    }
    
    const token = extractBearerToken(request, body)
    const diagnostics = getTokenDiagnostics(request)
    
    // If token present, try to verify and get uid/admin status
    let uid: string | null = null
    let isAdmin: boolean = false
    let verificationSuccess: boolean = false
    
    if (token) {
      try {
        const auth = getAdminAuth()
        const decoded = await auth.verifyIdToken(token)
        uid = decoded.uid
        
        // Check admin status
        const adminUids = (process.env.AMA_ADMIN_UIDS || '')
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
        isAdmin = adminUids.includes(uid)
        
        verificationSuccess = true
      } catch (e: any) {
        verificationSuccess = false
        // Don't expose error details in response
      }
    }
    
    return NextResponse.json({
      hasToken: Boolean(token),
      tokenLength: token ? token.length : 0,
      tokenStartsWithEyJ: token ? token.startsWith('eyJ') : false,
      verificationSuccess,
      uid,
      isAdmin,
      headerDiagnostics: diagnostics,
      hasBodyToken: Boolean(body?.authToken || body?.token),
    })
  } catch (error: any) {
    console.error('[Ama Debug Auth] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Debug auth check failed' },
      { status: 500 }
    )
  }
}


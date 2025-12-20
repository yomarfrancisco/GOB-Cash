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
    // Get token from Authorization header
    const authHeader = request.headers.get('authorization')
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid authorization header' },
        { status: 401 }
      )
    }

    const token = authHeader.substring(7)

    // Verify token
    let decoded
    try {
      const auth = getAdminAuth()
      decoded = await auth.verifyIdToken(token)
    } catch (e: any) {
      console.error('[Ama Whoami] verifyIdToken failed:', e?.message)
      return NextResponse.json(
        { error: 'verifyIdToken failed', detail: e?.message },
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


/**
 * PayFast Payment Data API Route
 * 
 * Returns payment record data for client-side reconciliation
 * GET /api/payfast/payment?ref=...
 * 
 * Returns: { amountZAR, currency, status, creditedAt, userId, payfastPaymentId }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getDb, getAuth } from '@/lib/firebase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const ref = searchParams.get('ref')

    if (!ref || typeof ref !== 'string') {
      return NextResponse.json({ error: 'ref is required' }, { status: 400 })
    }

    // Get auth token from request headers (optional - for user verification)
    const authHeader = request.headers.get('authorization')
    let userId: string | null = null

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      const auth = getAuth()
      try {
        const decodedToken = await auth.verifyIdToken(token)
        userId = decodedToken.uid
      } catch (error) {
        // Auth is optional for this endpoint - continue without user verification
      }
    }

    // Get payment record
    const db = getDb()
    const paymentRef = db.collection('payments').doc(ref)
    const paymentDoc = await paymentRef.get()

    if (!paymentDoc.exists) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    }

    const paymentData = paymentDoc.data()!

    // Verify payment belongs to user if auth provided
    if (userId && paymentData.userId !== userId) {
      return NextResponse.json({ error: 'Payment does not belong to user' }, { status: 403 })
    }

    // Return payment data
    return NextResponse.json({
      ref,
      amountZAR: paymentData.amountZAR || null,
      currency: paymentData.currency || 'ZAR',
      status: paymentData.status || null,
      creditedAt: paymentData.creditedAt?.toDate?.()?.toISOString() || null,
      userId: paymentData.userId || null,
      payfastPaymentId: paymentData.payfastPaymentId || null,
      createdAt: paymentData.createdAt?.toDate?.()?.toISOString() || null,
    })
  } catch (error: any) {
    console.error('[PayFast Payment] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch payment data' },
      { status: 500 }
    )
  }
}


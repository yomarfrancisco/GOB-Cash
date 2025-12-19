/**
 * PayFast Payment Status API Route
 * 
 * Gets payment status by reference
 * GET /api/payfast/status?ref=...
 * 
 * Returns: { ok: true, status: string, amountZAR: number, ... }
 */

import { NextRequest, NextResponse } from 'next/server'
import { db, auth } from '@/lib/firebase-admin'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const ref = searchParams.get('ref')

    if (!ref) {
      return NextResponse.json({ error: 'ref is required' }, { status: 400 })
    }

    // Get auth token from request headers
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    let userId: string

    try {
      const decodedToken = await auth.verifyIdToken(token)
      userId = decodedToken.uid
    } catch (error) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // Get payment record
    const paymentRef = db.collection('payments').doc(ref)
    const paymentDoc = await paymentRef.get()

    if (!paymentDoc.exists) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    }

    const paymentData = paymentDoc.data()!

    // Verify payment belongs to user
    if (paymentData.userId !== userId) {
      return NextResponse.json({ error: 'Payment does not belong to user' }, { status: 403 })
    }

    return NextResponse.json({
      ok: true,
      ref,
      status: paymentData.status,
      amountZAR: paymentData.amountZAR,
      createdAt: paymentData.createdAt,
      updatedAt: paymentData.updatedAt,
      payfastStatus: paymentData.payfastStatus,
    })
  } catch (error: any) {
    console.error('[PayFast Status] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get payment status' },
      { status: 500 }
    )
  }
}


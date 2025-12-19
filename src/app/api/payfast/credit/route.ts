/**
 * PayFast Credit API Route
 * 
 * Credits user balance after successful PayFast payment
 * POST /api/payfast/credit
 * 
 * Query params: ref (payment reference)
 * Returns: { ok: true, credited: boolean, newBalance: number }
 */

import { NextRequest, NextResponse } from 'next/server'
import { db, auth } from '@/lib/firebase-admin'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    // Get ref from query params or body
    const { searchParams } = new URL(request.url)
    const body = await request.json().catch(() => ({}))
    const ref = searchParams.get('ref') || body.ref

    if (!ref || typeof ref !== 'string') {
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

    // Check if already credited
    if (paymentData.status === 'CREDITED') {
      // Get current balance
      const walletRef = db.collection('users').doc(userId).collection('wallets').doc('cashZAR')
      const walletDoc = await walletRef.get()
      const currentBalance = walletDoc.exists ? (walletDoc.data()?.fiatBalance || 0) : 0

      // Log idempotency for live testing
      console.log('[PayFast Credit] Already credited (idempotent)', {
        ref,
        amountZAR: paymentData.amountZAR,
        currentBalance,
      })

      return NextResponse.json({
        ok: true,
        credited: false,
        alreadyCredited: true,
        newBalance: currentBalance,
      })
    }

    // If payment is still PENDING, try to validate with PayFast
    if (paymentData.status === 'PENDING') {
      // Optionally: Call PayFast validate/query endpoint here
      // For now, return error and let client retry
      return NextResponse.json(
        { 
          error: `Payment not complete yet. Status: ${paymentData.status}`,
          status: paymentData.status,
          retry: true,
        },
        { status: 400 }
      )
    }

    // Ensure payment is COMPLETE
    if (paymentData.status !== 'COMPLETE') {
      return NextResponse.json(
        { error: `Payment not complete. Status: ${paymentData.status}` },
        { status: 400 }
      )
    }

    const amountZAR = paymentData.amountZAR

    // Credit user balance atomically
    const walletRef = db.collection('users').doc(userId).collection('wallets').doc('cashZAR')
    
    await db.runTransaction(async (transaction) => {
      const walletDoc = await transaction.get(walletRef)
      const currentBalance = walletDoc.exists ? (walletDoc.data()?.fiatBalance || 0) : 0
      const newBalance = currentBalance + amountZAR

      // Update wallet balance
      if (walletDoc.exists) {
        transaction.update(walletRef, {
          fiatBalance: newBalance,
          updatedAt: new Date(),
        })
      } else {
        transaction.set(walletRef, {
          fiatBalance: newBalance,
          updatedAt: new Date(),
        })
      }

      // Mark payment as credited
      transaction.update(paymentRef, {
        status: 'CREDITED',
        creditedAt: new Date(),
      })

      return newBalance
    })

    // Get final balance
    const walletDoc = await walletRef.get()
    const finalBalance = walletDoc.exists ? (walletDoc.data()?.fiatBalance || 0) : 0

    // Log credit success for live testing
    console.log('[PayFast Credit] Balance credited', {
      ref,
      amountZAR: amountZAR,
      newBalance: finalBalance,
      credited: true,
    })

    return NextResponse.json({
      ok: true,
      credited: true,
      newBalance: finalBalance,
    })
  } catch (error: any) {
    console.error('[PayFast Credit] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to credit balance' },
      { status: 500 }
    )
  }
}


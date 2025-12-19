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
import { getDb, getAuth } from '@/lib/firebase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  // Log entry
  const { searchParams } = new URL(request.url)
  const body = await request.json().catch(() => ({}))
  const ref = searchParams.get('ref') || body.ref
  
  console.log('[PayFast Credit] ENTER', { ref })
  
  try {
    if (!ref || typeof ref !== 'string') {
      console.error('[PayFast Credit] Missing ref')
      return NextResponse.json({ error: 'ref is required' }, { status: 400 })
    }

    // Get auth token from request headers
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    let userId: string

    const auth = getAuth()
    try {
      const decodedToken = await auth.verifyIdToken(token)
      userId = decodedToken.uid
    } catch (error) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // Get payment record
    const db = getDb()
    const paymentRef = db.collection('payments').doc(ref)
    const paymentDoc = await paymentRef.get()

    if (!paymentDoc.exists) {
      console.error('[PayFast Credit] Payment not found', { ref })
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    }

    const paymentData = paymentDoc.data()!

    // Verify payment belongs to user
    if (paymentData.userId !== userId) {
      console.error('[PayFast Credit] Payment does not belong to user', { ref, paymentUserId: paymentData.userId, requestUserId: userId })
      return NextResponse.json({ error: 'Payment does not belong to user' }, { status: 403 })
    }

    // Log state
    const paymentStatus = paymentData.status || 'UNKNOWN'
    const hasPayfastPaymentId = !!paymentData.payfastPaymentId
    
    console.log('[PayFast Credit] state', {
      ref,
      paymentStatus,
      hasPayfastPaymentId,
      amountZAR: paymentData.amountZAR,
    })

    // Check if already credited
    if (paymentStatus === 'CREDITED') {
      // Get current balance
      const walletRef = db.collection('users').doc(userId).collection('wallets').doc('cashZAR')
      const walletDoc = await walletRef.get()
      const currentBalance = walletDoc.exists ? (walletDoc.data()?.fiatBalance || 0) : 0

      console.log('[PayFast Credit] Already credited (idempotent)', {
        ref,
        amountZAR: paymentData.amountZAR,
        currentBalance,
      })

      return NextResponse.json({
        ok: true,
        status: 'CREDITED',
        credited: false,
        alreadyCredited: true,
        newBalance: currentBalance,
      })
    }

    // If payment is still PENDING, return 200 with status (non-fatal, client can retry)
    if (paymentStatus === 'PENDING') {
      console.log('[PayFast Credit] Payment still PENDING, returning 200 for polling', {
        ref,
        status: paymentStatus,
      })
      
      return NextResponse.json({
        ok: true,
        status: 'PENDING',
        retry: true,
      })
    }

    // Ensure payment is COMPLETE before crediting
    if (paymentStatus !== 'COMPLETE') {
      console.error('[PayFast Credit] Payment not in valid state for crediting', {
        ref,
        status: paymentStatus,
      })
      
      return NextResponse.json(
        { 
          ok: false,
          error: `Payment not complete. Status: ${paymentStatus}`,
          status: paymentStatus,
        },
        { status: 400 }
      )
    }

    const amountZAR = paymentData.amountZAR

    // Credit user balance atomically
    const walletRef = db.collection('users').doc(userId).collection('wallets').doc('cashZAR')
    
    let beforeBalance = 0
    let afterBalance = 0
    
    await db.runTransaction(async (transaction) => {
      const walletDoc = await transaction.get(walletRef)
      beforeBalance = walletDoc.exists ? (walletDoc.data()?.fiatBalance || 0) : 0
      afterBalance = beforeBalance + amountZAR

      console.log('[PayFast Credit] Transaction executing', {
        ref,
        beforeBalance,
        amountZAR,
        computedNewBalance: afterBalance,
      })

      // Update wallet balance
      if (walletDoc.exists) {
        transaction.update(walletRef, {
          fiatBalance: afterBalance,
          updatedAt: new Date(),
        })
      } else {
        // Create wallet with all required WalletDoc fields
        // This ensures subscription can map it correctly by walletId
        transaction.set(walletRef, {
          walletId: 'cashZAR',
          kind: 'cash',
          displayCurrency: 'ZAR',
          fiatBalance: afterBalance,
          usdtBalance: 0,
          updatedAt: new Date(),
        })
      }

      // Mark payment as credited
      transaction.update(paymentRef, {
        status: 'CREDITED',
        creditedAt: new Date(),
      })

      return afterBalance
    })

    // Get final balance to verify
    const walletDoc = await walletRef.get()
    const finalBalance = walletDoc.exists ? (walletDoc.data()?.fiatBalance || 0) : 0

    // Log credit success
    console.log('[PayFast Credit] credited', {
      ref,
      beforeBalance,
      afterBalance,
      finalBalance,
      amountZAR,
      transactionSuccess: finalBalance === afterBalance,
    })

    return NextResponse.json({
      ok: true,
      status: 'CREDITED',
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


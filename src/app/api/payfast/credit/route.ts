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
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    }

    const paymentData = paymentDoc.data()!

    // Verify payment belongs to user
    if (paymentData.userId !== userId) {
      return NextResponse.json({ error: 'Payment does not belong to user' }, { status: 403 })
    }

    // Check if already credited (idempotency check)
    // Check both status === 'CREDITED' AND creditedAt field to prevent double credit
    // Return handler sets status: 'COMPLETE' + creditedAt, so we must check creditedAt too
    if (paymentData.status === 'CREDITED' || paymentData.creditedAt) {
      // Get current balance
      const walletRef = db.collection('users').doc(userId).collection('wallets').doc('cashZAR')
      const walletDoc = await walletRef.get()
      const currentBalance = walletDoc.exists ? (walletDoc.data()?.fiatBalance || 0) : 0

      // Log idempotency for live testing
      console.log('[PayFast Credit] Already credited (idempotent)', {
        ref,
        amountZAR: paymentData.amountZAR,
        currentBalance,
        status: paymentData.status,
        creditedAt: paymentData.creditedAt?.toDate?.()?.toISOString(),
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
      // Re-read payment doc in transaction to check for concurrent credit
      const paymentDocInTx = await transaction.get(paymentRef)
      if (!paymentDocInTx.exists) {
        throw new Error('Payment not found in transaction')
      }
      
      const paymentDataInTx = paymentDocInTx.data()!
      
      // Double-check idempotency inside transaction (prevents race condition)
      if (paymentDataInTx.creditedAt || paymentDataInTx.status === 'CREDITED') {
        // Already credited by another process - get current balance and return
        const walletDocInTx = await transaction.get(walletRef)
        const currentBalance = walletDocInTx.exists ? (walletDocInTx.data()?.fiatBalance || 0) : 0
        
        console.log('[PayFast Credit] Already credited in transaction (race condition prevented)', {
          ref,
          amountZAR: paymentData.amountZAR,
          currentBalance,
          status: paymentDataInTx.status,
          creditedAt: paymentDataInTx.creditedAt?.toDate?.()?.toISOString(),
        })
        
        // Return current balance (no credit)
        return currentBalance
      }
      
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
        // Create wallet with all required WalletDoc fields
        // This ensures subscription can map it correctly by walletId
        transaction.set(walletRef, {
          walletId: 'cashZAR',
          kind: 'cash',
          displayCurrency: 'ZAR',
          fiatBalance: newBalance,
          usdtBalance: 0,
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

    // Mirror status update to user subcollection (non-blocking)
    try {
      const { updatePaymentStatus } = await import('@/lib/payfast/paymentMirror')
      await updatePaymentStatus(db, ref, userId, {
        status: 'CREDITED',
        creditedAt: new Date(),
      })
    } catch (mirrorError: any) {
      // Log but don't fail - payment is already credited in global collection
      console.warn('[PayFast Credit] Failed to mirror status update to subcollection', {
        ref,
        userId,
        error: mirrorError.message,
      })
    }

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


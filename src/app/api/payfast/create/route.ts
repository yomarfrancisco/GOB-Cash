/**
 * PayFast Payment Creation API Route
 * 
 * Creates a PayFast payment and returns redirect URL
 * POST /api/payfast/create
 * 
 * Body: { user_id: string, amount_zar: number }
 * Returns: { ok: true, ref: string, redirect_url: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/firebase-admin'
import { getPayFastBase, buildParamsAndSignature } from '@/lib/payfast'
import crypto from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface CreatePaymentRequest {
  user_id: string
  amount_zar: number
}

// PayFast configuration from environment variables
const getPayFastConfig = () => {
  const mode = process.env.PAYFAST_MODE || 'live'
  const merchantId = process.env.PAYFAST_MERCHANT_ID
  const merchantKey = process.env.PAYFAST_MERCHANT_KEY
  const passphrase = process.env.PAYFAST_PASSPHRASE
  const notifyUrl = process.env.PAYFAST_NOTIFY_URL || `${process.env.NEXT_PUBLIC_APP_URL || 'https://gobankless.app'}/api/payfast/notify`
  const returnUrl = process.env.PAYFAST_RETURN_URL || `${process.env.NEXT_PUBLIC_APP_URL || 'https://gobankless.app'}/profile`
  const cancelUrl = process.env.PAYFAST_CANCEL_URL || `${process.env.NEXT_PUBLIC_APP_URL || 'https://gobankless.app'}/profile`

  if (!merchantId || !merchantKey || !passphrase) {
    throw new Error('PayFast configuration missing. Set PAYFAST_MERCHANT_ID, PAYFAST_MERCHANT_KEY, and PAYFAST_PASSPHRASE')
  }

  const baseUrl = getPayFastBase(mode)

  return {
    baseUrl,
    mode,
    merchantId,
    merchantKey,
    passphrase,
    notifyUrl,
    returnUrl,
    cancelUrl,
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: CreatePaymentRequest = await request.json()
    const { user_id, amount_zar } = body

    // Validate input
    if (!user_id || typeof user_id !== 'string') {
      return NextResponse.json({ error: 'user_id is required' }, { status: 400 })
    }

    if (!amount_zar || typeof amount_zar !== 'number' || amount_zar <= 0) {
      return NextResponse.json({ error: 'amount_zar must be a positive number' }, { status: 400 })
    }

    // Generate unique reference
    const ref = crypto.randomUUID()

    // Get PayFast configuration
    const config = getPayFastConfig()

    // Build raw parameters in exact order (no sorting, no encodeURIComponent)
    // Order matters for signature calculation
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://gobankless.app'
    const rawParams: Record<string, string> = {
      merchant_id: config.merchantId,
      merchant_key: config.merchantKey,
      return_url: `${baseUrl}/api/payfast/return?ref=${ref}`, // Server-side return handler (Option 5)
      cancel_url: `${config.cancelUrl}?cancel=true`,
      notify_url: config.notifyUrl,
      amount: amount_zar.toFixed(2), // Must be exactly 2 decimal places
      item_name: `GoBankless Deposit | REF:${ref.substring(0, 8)}`, // Option 4: Reference marker for backup reconciliation
      // Passphrase is included in signature calculation but NOT in final params
    }

    // Build params and signature using known-good implementation
    const { params, signature, toSign } = buildParamsAndSignature(rawParams, config.passphrase)

    // Add signature to params (after calculation)
    params.signature = signature

    // Store payment record in Firestore (dual-write: global + user subcollection)
    const db = getDb()
    const { upsertPayment } = await import('@/lib/payfast/paymentMirror')
    const admin = await import('firebase-admin')
    await upsertPayment(db, {
      ref,
      userId: user_id,
      amountZAR: amount_zar,
      currency: 'ZAR',
      status: 'PENDING',
      createdAt: admin.firestore.Timestamp.now(),
      provider: 'payfast',
      payfastParams: {
        merchant_id: params.merchant_id,
        amount: params.amount,
        item_name: params.item_name,
      },
    })
    
    // Log dual-write success (dev-only)
    if (process.env.NODE_ENV !== 'production') {
      console.log('[PayFast Create] Payment dual-write', {
        paymentRef: ref,
        uid: user_id,
        status: 'PENDING',
        wroteGlobal: true,
        wroteUserSubcollection: true,
      })
    }

    // Build redirect URL: ${PF_BASE}/eng/process?${params.toString()}
    const queryString = new URLSearchParams(params).toString()
    const redirectUrl = `${config.baseUrl}/eng/process?${queryString}`

    // Log debug info (server-side only)
    console.log('[PayFast Create] Payment created', {
      ref,
      amountZAR: amount_zar,
      baseUrl: config.baseUrl,
      mode: config.mode,
      userId: user_id,
      toSign: toSign.substring(0, 100) + '...', // Truncate for security
      computedSignature: signature.substring(0, 8) + '...',
      finalQueryString: queryString.substring(0, 100) + '...', // Truncate for security
    })

    return NextResponse.json({
      ok: true,
      ref,
      redirect_url: redirectUrl, // Ready-to-use GET URL
      form_data: params, // Also return for client-side POST if needed
    })
  } catch (error: any) {
    console.error('[PayFast Create] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create payment' },
      { status: 500 }
    )
  }
}


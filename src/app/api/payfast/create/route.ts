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
import { getPayFastBase, buildProcessQueryAndSignatureOrdered } from '@/lib/payfast'
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

    // Build ordered parameter pairs (order matters - matches known-working baseline)
    // Position A: m_payment_id immediately after merchant_key
    const pairs: Array<[string, string]> = [
      ['merchant_id', config.merchantId],
      ['merchant_key', config.merchantKey],
      ['m_payment_id', ref], // Position A: immediately after merchant_key
      ['return_url', `${config.returnUrl}?ref=${ref}`],
      ['cancel_url', `${config.cancelUrl}?cancel=true`],
      ['notify_url', config.notifyUrl],
      ['amount', amount_zar.toFixed(2)], // Must be exactly 2 decimal places
      ['item_name', `GoBankless Deposit - ${ref.substring(0, 8)}`],
    ]

    // Build query string and signature using ordered builder (no sorting)
    // This preserves insertion order to match the known-working baseline
    const { queryString, signature, toSign } = buildProcessQueryAndSignatureOrdered(pairs, config.passphrase)
    
    // Log for verification (temporary instrumentation)
    console.log('[PayFast Create] toSign:', toSign.substring(0, 200) + '...') // Truncate passphrase
    console.log('[PayFast Create] queryString:', queryString.substring(0, 200) + '...')
    console.log('[PayFast Create] signature:', signature)

    // Store payment record in Firestore
    const db = getDb()
    const paymentRef = db.collection('payments').doc(ref)
    await paymentRef.set({
      ref,
      userId: user_id,
      amountZAR: amount_zar,
      status: 'PENDING',
      createdAt: new Date(),
      payfastParams: {
        merchant_id: config.merchantId,
        amount: amount_zar.toFixed(2),
        item_name: `GoBankless Deposit - ${ref.substring(0, 8)}`,
      },
    })

    // Build redirect URL using the exact query string from signature builder
    // Do not rebuild with URLSearchParams - use the canonical queryString directly
    const redirectUrl = `${config.baseUrl}/eng/process?${queryString}&signature=${signature}`
    
    // Log redirect URL preview (first 200 chars for verification)
    console.log('[PayFast Create] redirectUrl:', redirectUrl.substring(0, 200) + '...')

    // Log debug info (server-side only)
    console.log('[PayFast Create] Payment created', {
      ref,
      amountZAR: amount_zar,
      baseUrl: config.baseUrl,
      mode: config.mode,
      userId: user_id,
      hasMPaymentId: queryString.includes('m_payment_id='),
      redirectUrlPreview: redirectUrl.substring(0, 200) + '...', // Truncate for security
    })

    return NextResponse.json({
      ok: true,
      ref,
      redirect_url: redirectUrl, // Ready-to-use GET URL
    })
  } catch (error: any) {
    console.error('[PayFast Create] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create payment' },
      { status: 500 }
    )
  }
}


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
import { db } from '@/lib/firebase-admin'
import crypto from 'crypto'

export const runtime = 'nodejs'

interface CreatePaymentRequest {
  user_id: string
  amount_zar: number
}

// PayFast configuration from environment variables
const getPayFastConfig = () => {
  const mode = process.env.PAYFAST_MODE || 'sandbox'
  const merchantId = process.env.PAYFAST_MERCHANT_ID
  const merchantKey = process.env.PAYFAST_MERCHANT_KEY
  const passphrase = process.env.PAYFAST_PASSPHRASE
  const notifyUrl = process.env.PAYFAST_NOTIFY_URL || `${process.env.NEXT_PUBLIC_APP_URL || 'https://gobankless.app'}/api/payfast/notify`
  const returnUrl = process.env.PAYFAST_RETURN_URL || `${process.env.NEXT_PUBLIC_APP_URL || 'https://gobankless.app'}/profile`
  const cancelUrl = process.env.PAYFAST_CANCEL_URL || `${process.env.NEXT_PUBLIC_APP_URL || 'https://gobankless.app'}/profile`

  if (!merchantId || !merchantKey || !passphrase) {
    throw new Error('PayFast configuration missing. Set PAYFAST_MERCHANT_ID, PAYFAST_MERCHANT_KEY, and PAYFAST_PASSPHRASE')
  }

  // Treat anything other than "sandbox" as live
  const baseUrl = mode === 'sandbox' 
    ? 'https://sandbox.payfast.co.za'
    : 'https://www.payfast.co.za'

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

/**
 * Generate PayFast signature
 * Parameters must be sorted alphabetically, URL-encoded, and concatenated
 */
function generatePayFastSignature(params: Record<string, string>, passphrase: string): string {
  // Sort parameters alphabetically
  const sortedKeys = Object.keys(params).sort()
  
  // Build query string with URL encoding
  const queryString = sortedKeys
    .map(key => `${key}=${encodeURIComponent(params[key]).replace(/%20/g, '+')}`)
    .join('&')
  
  // Add passphrase
  const signatureString = `${queryString}&passphrase=${encodeURIComponent(passphrase).replace(/%20/g, '+')}`
  
  // Generate MD5 hash
  return crypto.createHash('md5').update(signatureString).digest('hex')
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

    // Build PayFast parameters
    const payfastParams: Record<string, string> = {
      merchant_id: config.merchantId,
      merchant_key: config.merchantKey,
      return_url: `${config.returnUrl}?ref=${ref}`,
      cancel_url: `${config.cancelUrl}?cancel=true`,
      notify_url: config.notifyUrl,
      name_first: 'User', // Will be collected on PayFast checkout
      name_last: 'Deposit',
      email_address: '', // Will be collected on PayFast checkout
      cell_number: '',
      m_payment_id: ref,
      amount: amount_zar.toFixed(2),
      item_name: `GoBankless Deposit - ${ref.substring(0, 8)}`,
    }

    // Generate signature (passphrase included in signature calculation, not in params)
    const signature = generatePayFastSignature(payfastParams, config.passphrase)
    payfastParams.signature = signature

    // Store payment record in Firestore
    const paymentRef = db.collection('payments').doc(ref)
    await paymentRef.set({
      ref,
      userId: user_id,
      amountZAR: amount_zar,
      status: 'PENDING',
      createdAt: new Date(),
      payfastParams: {
        merchant_id: payfastParams.merchant_id,
        amount: payfastParams.amount,
        item_name: payfastParams.item_name,
      },
    })

    // Build redirect URL with form data
    const redirectUrl = `${config.baseUrl}/eng/process`

    // Log for live testing
    console.log('[PayFast Create] Payment created', {
      ref,
      amountZAR: amount_zar,
      baseUrl: config.baseUrl,
      mode: config.mode,
      userId: user_id,
    })

    return NextResponse.json({
      ok: true,
      ref,
      redirect_url: redirectUrl,
      form_data: payfastParams, // Client will POST this to PayFast
    })
  } catch (error: any) {
    console.error('[PayFast Create] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create payment' },
      { status: 500 }
    )
  }
}


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
import { getPayFastBase } from '@/lib/payfast'
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

    // Build query string ONCE - this exact string will be used for both signing and redirecting
    // PayFast computes signature from the exact query string it receives, so they must match byte-for-byte
    const params = new URLSearchParams()
    
    params.append('merchant_id', config.merchantId)
    params.append('merchant_key', config.merchantKey)
    params.append('return_url', `${config.returnUrl}?ref=${ref}`)
    params.append('cancel_url', `${config.cancelUrl}?cancel=true`)
    params.append('notify_url', config.notifyUrl)
    params.append('amount', amount_zar.toFixed(2)) // Must be exactly 2 decimal places
    params.append('item_name', `GoBankless Deposit - ${ref.substring(0, 8)}`)
    params.append('m_payment_id', ref) // PayFast will echo this back in ITN callback for reconciliation
    
    // Get the base query string (this is what PayFast will see, minus signature)
    const baseQS = params.toString()
    
    // Sign THAT EXACT STRING - do not re-encode, do not sort, do not rebuild
    let toSign = baseQS
    if (config.passphrase) {
      toSign += `&passphrase=${config.passphrase}`
    }
    
    // Compute MD5 hash
    const signature = crypto.createHash('md5').update(toSign).digest('hex')
    
    // Log for verification (temporary instrumentation)
    console.log('[PayFast Create] baseQS:', baseQS)
    console.log('[PayFast Create] toSign:', toSign.substring(0, 200) + '...') // Truncate passphrase
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

    // Redirect using the SAME query string - no second URLSearchParams, no mutation
    // This ensures PayFast receives the exact bytes we hashed
    const redirectUrl = `${config.baseUrl}/eng/process?${baseQS}&signature=${signature}`

    // Log debug info (server-side only)
    console.log('[PayFast Create] Payment created', {
      ref,
      amountZAR: amount_zar,
      baseUrl: config.baseUrl,
      mode: config.mode,
      userId: user_id,
      hasMPaymentId: baseQS.includes('m_payment_id='),
      redirectUrlPreview: redirectUrl.substring(0, 200) + '...', // Truncate for security
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


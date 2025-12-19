/**
 * PayFast ITN (Instant Transaction Notification) Handler
 * 
 * Receives POST form-encoded data from PayFast when payment status changes
 * POST /api/payfast/notify
 * 
 * Validates signature and updates payment status in Firestore
 */

import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/firebase-admin'
import crypto from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// PayFast configuration
const getPayFastConfig = () => {
  const merchantId = process.env.PAYFAST_MERCHANT_ID
  const merchantKey = process.env.PAYFAST_MERCHANT_KEY
  const passphrase = process.env.PAYFAST_PASSPHRASE

  if (!merchantId || !merchantKey || !passphrase) {
    throw new Error('PayFast configuration missing')
  }

  return { merchantId, merchantKey, passphrase }
}

/**
 * Parse form-encoded data from PayFast ITN
 */
function parseFormData(body: string): Record<string, string> {
  const params: Record<string, string> = {}
  const pairs = body.split('&')
  
  for (const pair of pairs) {
    const [key, value] = pair.split('=')
    if (key && value) {
      params[decodeURIComponent(key)] = decodeURIComponent(value)
    }
  }
  
  return params
}

/**
 * Generate PayFast signature for validation
 */
function generatePayFastSignature(params: Record<string, string>, passphrase: string): string {
  // Exclude signature from calculation
  const { signature: _, ...paramsToSign } = params
  
  // Sort parameters alphabetically
  const sortedKeys = Object.keys(paramsToSign).sort()
  
  // Build query string with URL encoding
  const queryString = sortedKeys
    .map(key => `${key}=${encodeURIComponent(paramsToSign[key]).replace(/%20/g, '+')}`)
    .join('&')
  
  // Add passphrase
  const signatureString = `${queryString}&passphrase=${encodeURIComponent(passphrase).replace(/%20/g, '+')}`
  
  // Generate MD5 hash
  return crypto.createHash('md5').update(signatureString).digest('hex')
}

export async function POST(request: NextRequest) {
  try {
    // Read raw body as text (form-encoded)
    const rawBody = await request.text()
    
    // Parse form data
    const params = parseFormData(rawBody)
    
    // Get payment reference
    const ref = params.m_payment_id
    if (!ref) {
      console.error('[PayFast Notify] Missing m_payment_id')
      return new NextResponse('Missing payment reference', { status: 400 })
    }

    // Get PayFast configuration
    const config = getPayFastConfig()

    // Validate merchant_id
    if (params.merchant_id !== config.merchantId) {
      console.error('[PayFast Notify] Invalid merchant_id', { received: params.merchant_id, expected: config.merchantId })
      return new NextResponse('Invalid merchant', { status: 400 })
    }

    // Validate signature
    const receivedSignature = params.signature
    const calculatedSignature = generatePayFastSignature(params, config.passphrase)
    const signatureMatch = receivedSignature === calculatedSignature
    
    // Log for live testing
    console.log('[PayFast Notify] Signature validation', {
      ref,
      signatureMatch,
      received: receivedSignature?.substring(0, 8) + '...',
      calculated: calculatedSignature?.substring(0, 8) + '...',
    })
    
    if (!signatureMatch) {
      console.error('[PayFast Notify] Signature mismatch', { received: receivedSignature, calculated: calculatedSignature })
      return new NextResponse('Invalid signature', { status: 400 })
    }

    // Get payment status
    const paymentStatus = params.payment_status
    const pfPaymentId = params.pf_payment_id

    // Log payment status for live testing
    console.log('[PayFast Notify] Payment status', {
      ref,
      paymentStatus,
      pfPaymentId,
    })

    // Update payment record in Firestore
    const db = getDb()
    const paymentRef = db.collection('payments').doc(ref)
    const paymentDoc = await paymentRef.get()

    if (!paymentDoc.exists) {
      console.error('[PayFast Notify] Payment not found', { ref })
      return new NextResponse('Payment not found', { status: 404 })
    }

    // Update payment status
    const updateData: any = {
      updatedAt: new Date(),
      payfastPaymentId: pfPaymentId,
      payfastStatus: paymentStatus,
      payfastData: params, // Store full ITN data for debugging
    }

    // If payment is complete, mark as COMPLETE
    if (paymentStatus === 'COMPLETE') {
      updateData.status = 'COMPLETE'
      updateData.completedAt = new Date()
    } else if (paymentStatus === 'FAILED' || paymentStatus === 'CANCELLED') {
      updateData.status = 'FAILED'
    }

    await paymentRef.update(updateData)

    console.log('[PayFast Notify] Payment updated', { ref, status: paymentStatus })

    // Return 200 OK to PayFast
    return new NextResponse('OK', { status: 200 })
  } catch (error: any) {
    console.error('[PayFast Notify] Error:', error)
    return new NextResponse('Internal server error', { status: 500 })
  }
}


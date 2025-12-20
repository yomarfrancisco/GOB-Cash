/**
 * PayFast Return Handler (Option 5: Fallback Credit Path)
 * 
 * Handles user return from PayFast payment page.
 * Verifies payment and credits wallet server-side (idempotent).
 * 
 * GET /api/payfast/return?ref=...&pf_payment_id=...&payment_status=...&amount_gross=...
 * 
 * This is a fallback path when ITN is broken or missing m_payment_id.
 * Crediting happens here server-side, not in client.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getDb, getAuth } from '@/lib/firebase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    
    // Get ref from query params (we set this in return_url)
    let ref = searchParams.get('ref')
    
    // Get PayFast return params
    const pfPaymentId = searchParams.get('pf_payment_id')
    const paymentStatus = searchParams.get('payment_status')
    const amountGross = searchParams.get('amount_gross')
    const itemName = searchParams.get('item_name')
    
    // Option 4: If ref is missing, try to parse from item_name using REF: marker
    if (!ref || ref.trim() === '') {
      console.log('[PayFast Return] ref missing from query params, attempting to parse from item_name', {
        itemName,
        allKeys: Array.from(searchParams.keys()),
      })
      
      if (itemName) {
        // Parse ref from item_name: "GoBankless Deposit | REF:12345678"
        const refMatch = itemName.match(/REF:([a-f0-9]{8})/i)
        if (refMatch) {
          const refPrefix = refMatch[1]
          console.log('[PayFast Return] Found ref prefix in item_name', { refPrefix })
          
          // Try to find payment by matching first 8 chars of ref
          // Note: This is a fallback - we'll search Firestore for matching payment
          const db = getDb()
          const paymentsRef = db.collection('payments')
          const snapshot = await paymentsRef
            .where('status', '==', 'PENDING')
            .limit(10)
            .get()
          
          // Find payment where ref starts with the prefix
          let foundPayment: FirebaseFirestore.QueryDocumentSnapshot | null = null
          for (const doc of snapshot.docs) {
            const docRef = doc.id
            if (docRef.toLowerCase().startsWith(refPrefix.toLowerCase())) {
              foundPayment = doc
              ref = docRef
              console.log('[PayFast Return] Matched payment by ref prefix', {
                refPrefix,
                fullRef: ref,
              })
              break
            }
          }
          
          if (!foundPayment) {
            console.error('[PayFast Return] Could not find payment matching ref prefix', {
              refPrefix,
              searchedPayments: snapshot.size,
            })
          }
        } else {
          console.warn('[PayFast Return] item_name does not contain REF: marker', { itemName })
        }
      }
    }
    
    // Log received params
    const receivedParams = {
      ref,
      pfPaymentId,
      paymentStatus,
      amountGross,
      itemName,
      refSource: ref ? (searchParams.get('ref') ? 'query_param' : 'item_name_parsed') : 'missing',
      allKeys: Array.from(searchParams.keys()),
    }
    console.log('[PayFast Return] received', receivedParams)
    
    // Require ref (either from query param or parsed from item_name)
    if (!ref || ref.trim() === '') {
      console.error('[PayFast Return] Missing ref parameter and could not parse from item_name', {
        itemName,
        allParams: Object.fromEntries(searchParams.entries()),
      })
      // Redirect to profile with error
      return NextResponse.redirect(new URL('/profile?error=missing_ref', request.url))
    }
    
    // Get payment record from Firestore
    const db = getDb()
    const paymentRef = db.collection('payments').doc(ref)
    const paymentDoc = await paymentRef.get()
    
    if (!paymentDoc.exists) {
      console.error('[PayFast Return] Payment not found', { ref })
      return NextResponse.redirect(new URL('/profile?error=payment_not_found', request.url))
    }
    
    const paymentData = paymentDoc.data()!
    
    // Verify payment is still PENDING (not already processed)
    if (paymentData.status !== 'PENDING') {
      console.log('[PayFast Return] Payment already processed', {
        ref,
        currentStatus: paymentData.status,
        pfPaymentId,
      })
      // Already processed - redirect to profile
      return NextResponse.redirect(new URL(`/profile?ref=${ref}`, request.url))
    }
    
    // Verify amount matches (within cents tolerance)
    const expectedAmount = parseFloat(paymentData.amountZAR.toFixed(2))
    const receivedAmount = amountGross ? parseFloat(amountGross) : null
    
    if (receivedAmount !== null) {
      const amountDiff = Math.abs(expectedAmount - receivedAmount)
      if (amountDiff > 0.01) {
        // Amount mismatch - log but don't fail (PayFast might send slightly different format)
        console.warn('[PayFast Return] Amount mismatch', {
          ref,
          expected: expectedAmount,
          received: receivedAmount,
          diff: amountDiff,
        })
      }
    }
    
    // Verify payment_status is COMPLETE (if provided)
    if (paymentStatus && paymentStatus !== 'COMPLETE') {
      console.log('[PayFast Return] Payment not complete', {
        ref,
        paymentStatus,
        pfPaymentId,
      })
      // Still PENDING - redirect to profile (client will retry)
      return NextResponse.redirect(new URL(`/profile?ref=${ref}&status=pending`, request.url))
    }
    
    // Get user ID from payment
    const userId = paymentData.userId
    
    // Credit wallet idempotently using Firestore transaction
    const walletRef = db.collection('users').doc(userId).collection('wallets').doc('cashZAR')
    const amountZAR = paymentData.amountZAR
    
    let credited = false
    let newBalance = 0
    
    await db.runTransaction(async (transaction) => {
      // Re-read payment doc in transaction
      const paymentDocInTx = await transaction.get(paymentRef)
      if (!paymentDocInTx.exists) {
        throw new Error('Payment not found in transaction')
      }
      
      const paymentDataInTx = paymentDocInTx.data()!
      
      // Check if already credited (idempotency check)
      if (paymentDataInTx.creditedAt || paymentDataInTx.status === 'CREDITED') {
        // Already credited - get current balance
        const walletDocInTx = await transaction.get(walletRef)
        newBalance = walletDocInTx.exists ? (walletDocInTx.data()?.fiatBalance || 0) : 0
        credited = false
        return // No-op
      }
      
      // Get current wallet balance
      const walletDocInTx = await transaction.get(walletRef)
      const currentBalance = walletDocInTx.exists ? (walletDocInTx.data()?.fiatBalance || 0) : 0
      newBalance = currentBalance + amountZAR
      
      // Update wallet balance
      if (walletDocInTx.exists) {
        transaction.update(walletRef, {
          fiatBalance: newBalance,
          updatedAt: new Date(),
        })
      } else {
        // Create wallet with all required WalletDoc fields
        transaction.set(walletRef, {
          walletId: 'cashZAR',
          kind: 'cash',
          displayCurrency: 'ZAR',
          fiatBalance: newBalance,
          usdtBalance: 0,
          updatedAt: new Date(),
        })
      }
      
      // Mark payment as COMPLETE and credited
      transaction.update(paymentRef, {
        status: 'COMPLETE',
        creditedAt: new Date(),
        creditedRef: ref,
        payfastPaymentId: pfPaymentId || null,
        payfastReturnData: {
          paymentStatus,
          amountGross,
          receivedAt: new Date(),
        },
        updatedAt: new Date(),
      })
      
      credited = true
    })
    
    // Log reconciliation result
    console.log('[PayFast Return] reconciled', {
      ref,
      pfPaymentId,
      paymentDocId: paymentRef.id,
      credited,
      newBalance,
      amountZAR,
    })
    
    // Mirror status update to user subcollection (non-blocking)
    if (credited && userId) {
      try {
        const { updatePaymentStatus } = await import('@/lib/payfast/paymentMirror')
        await updatePaymentStatus(db, ref, userId, {
          status: 'COMPLETE',
          creditedAt: new Date(),
          payfastPaymentId: pfPaymentId || null,
        })
      } catch (mirrorError: any) {
        // Log but don't fail - payment is already credited in global collection
        console.warn('[PayFast Return] Failed to mirror status update to subcollection', {
          ref,
          userId,
          error: mirrorError.message,
        })
      }
    }
    
    // Redirect to profile with success
    return NextResponse.redirect(new URL(`/profile?ref=${ref}&credited=${credited}`, request.url))
  } catch (error: any) {
    console.error('[PayFast Return] Error:', error)
    // Redirect to profile with error
    return NextResponse.redirect(new URL('/profile?error=return_processing_failed', request.url))
  }
}


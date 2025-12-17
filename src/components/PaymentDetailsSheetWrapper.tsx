'use client'

import { useState } from 'react'
import PaymentDetailsSheet from './PaymentDetailsSheet'
import { usePaymentDetailsSheet } from '@/store/usePaymentDetailsSheet'
import { useFinancialInboxStore } from '@/state/financialInbox'
import { tx_createPaymentAndSettle } from '@/lib/transactions/clientFunctions'

export default function PaymentDetailsSheetWrapper() {
  const { close: closePaymentDetails, mode } = usePaymentDetailsSheet()
  const { openInbox, openChatSheet } = useFinancialInboxStore()
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  return (
    <PaymentDetailsSheet
      onSubmit={async ({ mode: submitMode, amountZAR, handle }) => {
        // Only handle 'pay' mode for now (real payment)
        // 'request' mode can still use the old Zustand flow
        if (submitMode !== 'pay') {
          // Fallback to old flow for request mode
          const { openAmaChatWithPaymentScenario } = await import('@/lib/cashDeposit/chatOrchestration')
          closePaymentDetails()
          setTimeout(() => {
            openAmaChatWithPaymentScenario(submitMode, amountZAR, handle)
          }, 220)
          return
        }

        // Close PaymentDetailsSheet
        closePaymentDetails()
        
        // Call the payment function
        setIsSubmitting(true)
        try {
          const result = await tx_createPaymentAndSettle({
            receiverHandle: handle,
            amountZAR,
          })
          
          // Open inbox and navigate to transaction thread
          // Transaction threads are automatically synced, so we can open by txId
          openInbox()
          
          // Small delay to ensure inbox is open before switching to chat
          setTimeout(() => {
            openChatSheet(result.txId)
          }, 100)
        } catch (error: any) {
          console.error('[PaymentDetailsSheetWrapper] Failed to create payment:', error)
          
          // Show error to user (could be improved with a toast/alert)
          alert(
            error?.code === 'failed-precondition'
              ? `Insufficient balance. ${error.message}`
              : error?.code === 'not-found'
              ? 'Recipient not found. Please check the handle.'
              : error?.code === 'permission-denied'
              ? 'Payment sending is restricted for MVP'
              : `Failed to create payment: ${error.message || 'Unknown error'}`
          )
        } finally {
          setIsSubmitting(false)
        }
      }}
    />
  )
}


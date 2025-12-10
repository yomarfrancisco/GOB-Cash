'use client'

import PaymentDetailsSheet from './PaymentDetailsSheet'
import { usePaymentDetailsSheet } from '@/store/usePaymentDetailsSheet'
import { openAmaChatWithPaymentScenario } from '@/lib/cashDeposit/chatOrchestration'

export default function PaymentDetailsSheetWrapper() {
  const { close: closePaymentDetails } = usePaymentDetailsSheet()
  
  return (
    <PaymentDetailsSheet
      onSubmit={({ mode, amountZAR, handle }) => {
        // Close PaymentDetailsSheet
        closePaymentDetails()
        
        // Open Ama chat with payment scenario
        setTimeout(() => {
          openAmaChatWithPaymentScenario(mode, amountZAR, handle)
        }, 220)
      }}
    />
  )
}


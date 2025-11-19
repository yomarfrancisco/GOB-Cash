'use client'

import { useEffect } from 'react'
import ActionSheet from './ActionSheet'
import { useNotificationStore } from '@/store/notifications'
import '@/styles/success-sheet.css'

type SuccessSheetProps = {
  open: boolean
  onClose: () => void
  amountZAR: string // formatted via formatZAR()
  recipient?: string // email or phone (optional for deposit)
  autoDownloadReceipt?: boolean // default true
  kind?: 'send' | 'deposit' // default 'send'
  flowType?: 'payment' | 'transfer' // default 'payment'
}

export default function SuccessSheet({
  open,
  onClose,
  amountZAR,
  recipient,
  autoDownloadReceipt = true,
  kind = 'send',
  flowType = 'payment',
}: SuccessSheetProps) {
  const pushNotification = useNotificationStore((state) => state.pushNotification)

  useEffect(() => {
    if (!open || !autoDownloadReceipt) return

    // TODO: replace with real receipt URL once backend available
    try {
      const a = document.createElement('a')
      a.href = '/api/receipt.pdf' // placeholder endpoint
      a.download = 'payment-receipt.pdf'
      // Fire and forget (will no-op if endpoint not present)
      setTimeout(() => a.click(), 150)
    } catch {
      // Ignore errors
    }
  }, [open, autoDownloadReceipt])

  // Emit payment/transfer notification when success sheet opens
  useEffect(() => {
    if (!open) return

    if (kind === 'send' && recipient) {
      // Extract amount from formatted string (e.g., "R 100.00" or "303.464 USDT")
      const amountMatch = amountZAR.match(/[\d,]+\.?\d*/)
      const numericAmount = amountMatch ? parseFloat(amountMatch[0].replace(/,/g, '')) : 0
      const isUSDT = amountZAR.includes('USDT')
      
      if (flowType === 'transfer') {
        pushNotification({
          kind: 'transfer',
          title: 'Transfer completed',
          body: recipient.includes('@')
            ? `You transferred R${numericAmount.toFixed(2)} to ${recipient}.`
            : `You transferred ${amountZAR} to ${recipient}.`,
          amount: {
            currency: isUSDT ? 'USDT' : 'ZAR',
            value: -numericAmount,
          },
          direction: 'down',
          actor: {
            type: 'user',
          },
          routeOnTap: '/transactions',
        })
      } else {
        pushNotification({
          kind: 'payment_sent',
          title: 'Payment sent',
          body: recipient.includes('@') || recipient.includes('.')
            ? `You sent R${numericAmount.toFixed(2)} to ${recipient}.`
            : `You sent ${amountZAR} to ${recipient}.`,
          amount: {
            currency: isUSDT ? 'USDT' : 'ZAR',
            value: -numericAmount,
          },
          direction: 'down',
          actor: {
            type: 'user',
          },
          routeOnTap: '/transactions',
        })
      }
    } else if (kind === 'deposit') {
      const amountMatch = amountZAR.match(/[\d,]+\.?\d*/)
      const numericAmount = amountMatch ? parseFloat(amountMatch[0].replace(/,/g, '')) : 0
      
      pushNotification({
        kind: 'payment_received',
        title: 'Deposit received',
        body: `You deposited R${numericAmount.toFixed(2)}.`,
        amount: {
          currency: 'ZAR',
          value: numericAmount,
        },
        direction: 'up',
        actor: {
          type: 'system',
        },
        routeOnTap: '/transactions',
      })
    }
  }, [open, kind, recipient, amountZAR, flowType, pushNotification])

  return (
    <ActionSheet open={open} onClose={onClose} title="" className="send-success" size="tall">
      <div className="success-sheet" role="dialog" aria-labelledby="success-title">
        <div className="success-header">
          <img
            src="/assets/checkmark_circle.svg"
            alt="success"
            className="success-icon"
            width={56}
            height={56}
          />
          {kind === 'deposit' ? (
            <>
              <p id="success-title" className="success-headline" aria-live="polite">
                Deposit successful
              </p>
              <p className="success-target">You deposited {amountZAR}.</p>
            </>
          ) : (
            <>
              <p id="success-title" className="success-headline" aria-live="polite">
                {flowType === 'transfer' 
                  ? `You transferred ${amountZAR} to`
                  : `You sent ${amountZAR} to`}
              </p>
              <p className="success-target">{recipient}</p>
            </>
          )}
        </div>
        <div className="success-spacer" />
        <p className="success-receipt">Proof of payment will be emailed to you</p>
        <button className="success-btn" onClick={onClose}>
          Got it
        </button>
      </div>
    </ActionSheet>
  )
}


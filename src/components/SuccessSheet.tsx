'use client'

import { useEffect } from 'react'
import Image from 'next/image'
import ActionSheet from './ActionSheet'
import { useNotificationStore } from '@/store/notifications'
import '@/styles/success-sheet.css'

type SuccessSheetProps = {
  open: boolean
  onClose: () => void
  amountZAR: string // formatted via formatZAR()
  amountUSDT?: string // formatted USDT amount (optional, for card deposits)
  recipient?: string // email or phone (optional for deposit)
  autoDownloadReceipt?: boolean // default true
  kind?: 'send' | 'deposit' | 'card' // default 'send'
  flowType?: 'payment' | 'transfer' // default 'payment'
  headlineOverride?: string // Optional override for deposit headline
  subtitleOverride?: string // Optional override for deposit subtitle
  receiptOverride?: string // Optional override for receipt line
}

export default function SuccessSheet({
  open,
  onClose,
  amountZAR,
  amountUSDT,
  recipient,
  autoDownloadReceipt = true,
  kind = 'send',
  flowType = 'payment',
  headlineOverride,
  subtitleOverride,
  receiptOverride,
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
        // Determine card type from recipient
        const isMZN = recipient.toLowerCase().includes('mzn') || recipient.toLowerCase().includes('mozambique')
        const isZAR = recipient.toLowerCase().includes('zar') || recipient.toLowerCase().includes('south africa')
        const isCrypto = recipient.toLowerCase().includes('crypto') || recipient.toLowerCase().includes('eth') || recipient.toLowerCase().includes('btc')
        
        let title = 'Transfer completed'
        let body = `You transferred ${amountZAR} to ${recipient}.`
        
        if (isMZN) {
          title = 'Card top-up completed'
          body = `You moved R${numericAmount.toFixed(2)} into your MZN card.`
        } else if (isZAR) {
          title = 'Card top-up completed'
          body = `You topped up your ZAR card with R${numericAmount.toFixed(2)}.`
        } else if (isCrypto) {
          title = 'Transfer completed'
          body = `You moved R${numericAmount.toFixed(2)} into your Crypto Card.`
        } else if (recipient.includes('@')) {
          body = `You transferred R${numericAmount.toFixed(2)} to ${recipient}.`
        }
        
        pushNotification({
          kind: 'transfer',
          title: title,
          body: body,
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
        // Determine if it's a cross-border payment
        const isCrossBorder = recipient.includes('@') && (
          recipient.toLowerCase().includes('mzn') ||
          recipient.toLowerCase().includes('zwd') ||
          recipient.toLowerCase().includes('zim') ||
          recipient.toLowerCase().includes('moz')
        )
        
        const title = isCrossBorder 
          ? 'Payment sent across border'
          : recipient.includes('@')
          ? `You paid R${numericAmount.toFixed(2)} to ${recipient}`
          : 'Payment sent'
        
        const body = isCrossBorder
          ? `You sent R${numericAmount.toFixed(2)} to ${recipient}. Payment complete.`
          : recipient.includes('@')
          ? 'Payment complete.'
          : `You sent ${amountZAR} to ${recipient}.`
        
        pushNotification({
          kind: 'payment_sent',
          title: title,
          body: body,
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
        title: 'Cash deposit secured',
        body: `Your cash deposit of R${numericAmount.toFixed(2)} has been received at GoBankless HQ.`,
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
    } else if (kind === 'card') {
      const amountMatch = amountZAR.match(/[\d,]+\.?\d*/)
      const numericAmount = amountMatch ? parseFloat(amountMatch[0].replace(/,/g, '')) : 0
      
      pushNotification({
        kind: 'payment_received',
        title: 'Card payment confirmed',
        body: `Your card payment of R${numericAmount.toFixed(2)} has been processed.`,
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
          <Image
            src="/assets/checkmark_circle.svg"
            alt="success"
            className="success-icon"
            width={56}
            height={56}
            priority
            unoptimized
          />
          {kind === 'deposit' ? (
            <>
              <p id="success-title" className="success-headline" aria-live="polite">
                {headlineOverride ?? 'Cash conversion confirmed'}
              </p>
              <p className="success-target">
                {subtitleOverride ?? `You converted ${amountZAR} in cash to crypto.`}
              </p>
            </>
          ) : kind === 'card' ? (
            <>
              <p id="success-title" className="success-headline" aria-live="polite">
                {headlineOverride ?? 'Card payment confirmed'}
              </p>
              <p className="success-target">
                {subtitleOverride ?? (amountUSDT 
                  ? `You purchased ${amountUSDT} USDT by card.`
                  : 'Card payment successful.')}
              </p>
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
        <p className="success-receipt">
          {receiptOverride ?? 'Proof of payment will be emailed to you.'}
        </p>
        <button className="success-btn" onClick={onClose}>
          Got it
        </button>
      </div>
    </ActionSheet>
  )
}


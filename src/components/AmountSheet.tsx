'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import ActionSheet from './ActionSheet'
import AmountKeypad from './AmountKeypad'
import FitAmount from './FitAmount'
import { formatZAR, formatZARWithDot, formatUSDT } from '@/lib/money'
import '@/styles/amount-sheet.css'

type AmountSheetProps = {
  open: boolean
  onClose: () => void
  mode: 'deposit' | 'withdraw' | 'send' | 'depositCard' | 'convert' // for header text (e.g., "Buy", "Withdraw", "Convert")
  flowType?: 'payment' | 'transfer' // default 'payment'
  balanceZAR?: number // show at top small "R200.00 balance"
  fxRateZARperUSDT?: number // default 18.10 if undefined
  ctaLabel?: string // default "Transfer USDT"
  onSubmit?: (payload: {
    amountZAR: number
    amountUSDT?: number
    mode?: 'deposit' | 'withdraw' | 'send' | 'depositCard' | 'convert'
  }) => void
  onAmountSubmit?: (amountZAR: number) => void // simpler callback for send/transfer flow
  showDualButtons?: boolean // if true, show "Cash" and "Card" buttons instead of single CTA
  onCashSubmit?: (payload: { amountZAR: number; amountUSDT?: number; mode?: string }) => void // callback for Cash button
  onCardSubmit?: (payload: { amountZAR: number; amountUSDT?: number; mode?: string }) => void // callback for Card button
  entryPoint?: 'helicopter' | 'cashButton' // distinguishes entry point for conditional button rendering
  onScanClick?: () => void // callback for scan icon (only shown for cashButton entryPoint)
  initialAmount?: number // optional initial amount to pre-fill (for back navigation)
}

export default function AmountSheet({
  open,
  onClose,
  mode,
  flowType = 'payment',
  balanceZAR = 200,
  fxRateZARperUSDT = 18.1,
  ctaLabel,
  onSubmit,
  onAmountSubmit,
  showDualButtons = false,
  onCashSubmit,
  onCardSubmit,
  entryPoint,
  onScanClick,
  initialAmount,
}: AmountSheetProps) {
  const [amount, setAmount] = useState('0')

  // Reset amount when sheet opens, or use initialAmount if provided
  useEffect(() => {
    if (open) {
      if (initialAmount !== undefined && initialAmount > 0) {
        // Format initial amount (remove trailing zeros, but keep decimals if needed)
        const formatted = initialAmount % 1 === 0 
          ? initialAmount.toString() 
          : initialAmount.toFixed(2).replace(/\.?0+$/, '')
        setAmount(formatted)
      } else {
        setAmount('0')
      }
    }
  }, [open, initialAmount])

  const amountZAR = parseFloat(amount) || 0
  const amountUSDT = amountZAR / fxRateZARperUSDT

  const handleNumberChange = (next: string) => {
    // Enforce max 2 decimal places
    if (next.includes('.')) {
      const [whole, decimal] = next.split('.')
      if (decimal && decimal.length > 2) {
        return
      }
    }
    // Prevent multiple dots
    if ((next.match(/\./g) || []).length > 1) {
      return
    }
    // Prevent leading zeros except "0."
    if (next.length > 1 && next[0] === '0' && next[1] !== '.') {
      return
    }
    setAmount(next)
  }

  const handleBackspace = () => {
    if (amount.length <= 1) {
      setAmount('0')
    } else {
      setAmount(amount.slice(0, -1))
    }
  }

  const handleDot = () => {
    if (!amount.includes('.')) {
      setAmount(amount + '.')
    }
  }

  const handleSubmit = () => {
    console.debug('[AMOUNT CTA] pressed', {
      mode,
      hasOnSubmit: !!onSubmit,
      hasOnCashSubmit: !!onCashSubmit,
      hasOnCardSubmit: !!onCardSubmit,
      hasOnAmountSubmit: !!onAmountSubmit,
      flowType,
    })
    if (onAmountSubmit && (mode === 'send' || flowType === 'transfer')) {
      onAmountSubmit(amountZAR)
    } else if (onSubmit) {
      onSubmit({
        amountZAR: amountZAR,
        amountUSDT: mode !== 'depositCard' ? amountUSDT : undefined,
        mode,
      })
    }
  }

  const handleCashSubmit = () => {
    console.debug('[AMOUNT CTA] handleCashSubmit pressed', {
      mode,
      hasOnCashSubmit: !!onCashSubmit,
      hasOnSubmit: !!onSubmit,
    })
    // Same as current handleSubmit - triggers cash convert flow
    if (onCashSubmit) {
      onCashSubmit({
        amountZAR: amountZAR,
        amountUSDT: amountUSDT,
        mode: 'convert',
      })
    } else if (onSubmit) {
      // Fallback to existing onSubmit for backward compatibility
      onSubmit({
        amountZAR: amountZAR,
        amountUSDT: amountUSDT,
        mode: 'convert',
      })
    }
  }

  const handleCardSubmit = () => {
    // Handler for card payment flow ("Pay someone")
    if (onCardSubmit) {
      onCardSubmit({
        amountZAR: amountZAR,
        amountUSDT: amountUSDT,
        mode: 'convert',
      })
    }
  }

  // Handler for "Request" button (cash convert flow)
  const handleRequestSubmit = () => {
    // Same as handleCashSubmit - triggers cash convert flow
    handleCashSubmit()
  }

  // Detect helicopter convert flow for dual buttons
  const isHelicopterConvert = mode === 'convert' && entryPoint === 'helicopter'
  
  // Detect $-button convert flow (Request/Pay someone)
  const isCashButtonConvert = mode === 'convert' && entryPoint === 'cashButton'
  
  // Minimum amount for cash transactions (helicopter flow only)
  const MIN_CASH_ZAR = 5000
  const meetsMinCash = isHelicopterConvert ? amountZAR >= MIN_CASH_ZAR : true
  
  const modeLabel = flowType === 'transfer' 
    ? 'Transfer' 
    : mode === 'deposit' || mode === 'depositCard' 
    ? 'Buy' 
    : mode === 'withdraw' 
    ? 'Withdraw' 
    : mode === 'convert'
    ? (isHelicopterConvert ? 'Cash Transactions' : 'Convert to crypto')
    : 'Send'
  const defaultCtaLabel = mode === 'depositCard' 
    ? 'Deposit' 
    : mode === 'send' 
    ? 'Send' 
    : mode === 'convert'
    ? 'Request agent'
    : 'Transfer USDT'
  const finalCtaLabel = ctaLabel || defaultCtaLabel
  const isPositive = amountZAR > 0

  // Format amount for display (remove leading zeros except "0.")
  const displayAmount = amount === '0' ? '0' : amount.replace(/^0+(?=\d)/, '')

  // Show scan icon only for cashButton entryPoint
  const showScanIcon = entryPoint === 'cashButton' && onScanClick

  // Determine if keypad should use lime green background (both helicopter and $-button flows)
  const useLimeGreenBackground = isHelicopterConvert || isCashButtonConvert

  return (
    <ActionSheet open={open} onClose={onClose} title="" className={`amount ${useLimeGreenBackground ? 'cash-keypad' : ''} ${isHelicopterConvert ? 'cash-transactions' : ''}`} size="tall">
      <div className={`amount-sheet amount-sheet-wrapper ${isHelicopterConvert ? 'amount-sheet--cash-transactions' : ''}`}>
        <div className={`amount-sheet__header ${showScanIcon ? 'amount-sheet__header--with-scan' : ''}`} style={{ height: 'var(--hdr-h, 118px)' }}>
          {showScanIcon && (
            <button
              onClick={onScanClick}
              className="amount-sheet__scan-button"
              aria-label="Scan QR code"
              type="button"
            >
              <Image src="/assets/core/scan.svg" alt="Scan" width={24} height={24} />
            </button>
          )}
          <div className="amount-sheet__header-content">
            <div className="amount-sheet__balance">
              {formatZAR(balanceZAR)} <span className="amount-sheet__balance-label">balance</span>
            </div>
            <div className="amount-sheet__title">{modeLabel}</div>
          </div>
          {/* Close button is provided by ActionSheet (as-close-only) */}
        </div>
        <div className="amount-body">
          <div className="amount-sheet__amount-display">
            <FitAmount
              text={formatZARWithDot(amountZAR)}
              maxPx={72}
              minPx={28}
              className="amount-sheet__zar amount-fit"
            />
            <div className="amount-sheet__usdt-chip">{formatUSDT(amountUSDT)}</div>
          </div>
          <AmountKeypad
            value={displayAmount}
            onChange={handleNumberChange}
            onBackspace={handleBackspace}
            onDot={handleDot}
            onSubmit={handleSubmit}
            ctaLabel={finalCtaLabel}
            hideCTA
            isConvertMode={mode === 'convert'}
            isHelicopterConvert={isHelicopterConvert}
            amountZAR={amountZAR}
          />
        </div>
        <div className={`amount-cta ${(entryPoint === 'cashButton' || isHelicopterConvert || showDualButtons) ? 'amount-cta--dual' : ''} ${useLimeGreenBackground ? 'amount-cta--lime-green' : ''} ${isHelicopterConvert ? 'amount-cta--cash-transactions' : ''}`} style={{ ['--cta-h' as any]: '88px' }}>
          {isHelicopterConvert ? (
            // Dual buttons for helicopter/map entry point: "Deposit Cash" and "Withdraw Cash"
            // Both trigger the same map convert flow
            <>
              <button 
                className="amount-keypad__cta amount-keypad__cta--cash" 
                onClick={handleCashSubmit} 
                type="button"
                disabled={!meetsMinCash}
              >
                Deposit Cash
              </button>
              <button 
                className="amount-keypad__cta amount-keypad__cta--card" 
                onClick={handleCashSubmit} 
                type="button"
                disabled={!meetsMinCash}
              >
                Withdraw Cash
              </button>
            </>
          ) : entryPoint === 'cashButton' ? (
            // Dual buttons for $ button entry point: "Request" and "Pay someone"
            <>
              <button 
                className="amount-keypad__cta amount-keypad__cta--cash" 
                onClick={handleRequestSubmit} 
                type="button"
                disabled={!isPositive}
              >
                Request
              </button>
              <button 
                className="amount-keypad__cta amount-keypad__cta--card" 
                onClick={handleCardSubmit} 
                type="button"
                disabled={!isPositive}
              >
                Pay someone
              </button>
            </>
          ) : showDualButtons ? (
            // Legacy dual button support (backward compatibility)
            <>
              <button 
                className="amount-keypad__cta amount-keypad__cta--cash" 
                onClick={handleCashSubmit} 
                type="button"
                disabled={!isPositive}
              >
                Cash
              </button>
              <button 
                className="amount-keypad__cta amount-keypad__cta--card" 
                onClick={handleCardSubmit} 
                type="button"
                disabled={!isPositive}
              >
                Card
              </button>
            </>
          ) : (
            // Default single button
            <button 
              className="amount-keypad__cta" 
              onClick={handleSubmit} 
              type="button"
              disabled={!isPositive}
            >
              {finalCtaLabel}
              <span className="amount-keypad__cta-arrow">→</span>
            </button>
          )}
        </div>
      </div>
    </ActionSheet>
  )
}


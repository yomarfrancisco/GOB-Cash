'use client'

import { useState, useEffect } from 'react'
import ActionSheet from './ActionSheet'
import AmountKeypad from './AmountKeypad'
import FitAmount from './FitAmount'
import { formatZAR, formatZARWithDot, formatUSDT } from '@/lib/money'
import '@/styles/amount-sheet.css'

type AmountSheetProps = {
  open: boolean
  onClose: () => void
  mode: 'deposit' | 'withdraw' | 'send' | 'depositCard' // for header text (e.g., "Buy", "Withdraw")
  flowType?: 'payment' | 'transfer' // default 'payment'
  balanceZAR?: number // show at top small "R200.00 balance"
  fxRateZARperUSDT?: number // default 18.10 if undefined
  ctaLabel?: string // default "Transfer USDT"
  onSubmit?: (payload: {
    amountZAR: number
    amountUSDT?: number
    mode?: 'deposit' | 'withdraw' | 'send' | 'depositCard'
  }) => void
  onAmountSubmit?: (amountZAR: number) => void // simpler callback for send/transfer flow
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
}: AmountSheetProps) {
  const [amount, setAmount] = useState('0')

  // Reset amount when sheet opens
  useEffect(() => {
    if (open) {
      setAmount('0')
    }
  }, [open])

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

  const modeLabel = flowType === 'transfer' 
    ? 'Transfer' 
    : mode === 'deposit' || mode === 'depositCard' 
    ? 'Buy' 
    : mode === 'withdraw' 
    ? 'Withdraw' 
    : 'Send'
  const defaultCtaLabel = mode === 'depositCard' ? 'Deposit' : mode === 'send' ? 'Send' : 'Transfer USDT'
  const finalCtaLabel = ctaLabel || defaultCtaLabel
  const isPositive = amountZAR > 0

  // Format amount for display (remove leading zeros except "0.")
  const displayAmount = amount === '0' ? '0' : amount.replace(/^0+(?=\d)/, '')

  return (
    <ActionSheet open={open} onClose={onClose} title="" className="amount" size="tall">
      <div className="amount-sheet amount-sheet-wrapper">
        <div className="amount-sheet__header" style={{ height: 'var(--hdr-h, 118px)' }}>
          <div className="amount-sheet__balance">
            {formatZAR(balanceZAR)} <span className="amount-sheet__balance-label">balance</span>
          </div>
          <div className="amount-sheet__title">{modeLabel}</div>
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
          />
        </div>
        <div className="amount-cta" style={{ ['--cta-h' as any]: '88px' }}>
          <button 
            className="amount-keypad__cta" 
            onClick={handleSubmit} 
            type="button"
            disabled={!isPositive}
          >
            {finalCtaLabel}
            <span className="amount-keypad__cta-arrow">→</span>
          </button>
        </div>
      </div>
    </ActionSheet>
  )
}


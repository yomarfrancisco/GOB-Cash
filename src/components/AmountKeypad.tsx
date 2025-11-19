'use client'

import React from 'react'

type AmountKeypadProps = {
  currencySymbol?: string // default 'R'
  value: string // numeric string (e.g. "100.00" or "100")
  onChange: (next: string) => void
  onBackspace: () => void
  onDot: () => void // decimal point
  onSubmit: () => void // CTA
  ctaLabel: string // e.g. "Transfer USDT"
  hideCTA?: boolean // if true, don't render the CTA (moved to parent)
}

export default function AmountKeypad({
  currencySymbol = 'R',
  value,
  onChange,
  onBackspace,
  onDot,
  onSubmit,
  ctaLabel,
  hideCTA = false,
}: AmountKeypadProps) {
  const handleNumber = (num: string) => {
    const current = value || '0'
    
    // If current is "0", replace it (unless adding decimal)
    if (current === '0' && num !== '.') {
      onChange(num)
      return
    }
    
    // Check decimal places
    if (current.includes('.')) {
      const [whole, decimal] = current.split('.')
      if (decimal && decimal.length >= 2) {
        return // Max 2 decimal places
      }
    }
    
    onChange(current + num)
  }

  const handleKeyClick = (key: string) => {
    if (key === '.') {
      onDot()
    } else if (key === '<') {
      onBackspace()
    } else {
      handleNumber(key)
    }
  }

  return (
    <div className="amount-keypad">
      <div className="amount-keypad__grid">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
          <button
            key={num}
            className="amount-keypad__key"
            onClick={() => handleKeyClick(num)}
            type="button"
          >
            {num}
          </button>
        ))}
        <button className="amount-keypad__key" onClick={onDot} type="button">
          .
        </button>
        <button className="amount-keypad__key" onClick={() => handleKeyClick('0')} type="button">
          0
        </button>
        <button className="amount-keypad__key" onClick={onBackspace} type="button">
          &lt;
        </button>
      </div>
      {!hideCTA && (
        <div className="amount-keypad__footer" style={{ ['--cta-h' as any]: '88px' }}>
          <div className="amount-keypad__fee-note">excl. 2.5–6.5% transaction fee</div>
          <button className="amount-keypad__cta" onClick={onSubmit} type="button">
            {ctaLabel}
            <span className="amount-keypad__cta-arrow">→</span>
          </button>
        </div>
      )}
      {hideCTA && (
        <div className="amount-keypad__fee-note" style={{ paddingTop: '12px', textAlign: 'center' }}>
          excl. 2.5–6.5% transaction fee
        </div>
      )}
    </div>
  )
}


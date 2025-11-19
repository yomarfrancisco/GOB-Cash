'use client'

import { useState, useRef, useEffect } from 'react'
import ActionSheet from './ActionSheet'
import Image from 'next/image'
import USDTWarningNote from './USDTWarningNote'
import { formatUSDT } from '@/lib/money'
import '@/styles/send-details-sheet.css'

type SendDetailsSheetProps = {
  open: boolean
  onClose: () => void
  amountZAR: number // from AmountSheet
  amountUSDT?: number // from AmountSheet
  sendMethod?: 'email' | 'wallet' | 'brics' | null
  flowType?: 'payment' | 'transfer' // default 'payment'
  onPay?: (payload: { to: string; note?: string; amountZAR: number }) => void
}

export default function SendDetailsSheet({ 
  open, 
  onClose, 
  amountZAR,
  amountUSDT,
  sendMethod,
  flowType = 'payment',
  onPay
}: SendDetailsSheetProps) {
  const [to, setTo] = useState('')
  const [note, setNote] = useState('')
  const toRef = useRef<HTMLInputElement>(null)

  const isHandleFlow = sendMethod === 'brics'

  // Initialize handle with "@" when sheet opens for handle flow
  useEffect(() => {
    if (open && isHandleFlow && !to.startsWith('@')) {
      setTo('@')
    } else if (open && !isHandleFlow) {
      setTo('')
    }
  }, [open, isHandleFlow])

  const canPay = amountZAR > 0 && to.trim().length > (isHandleFlow ? 1 : 0) // "@" counts as 1 char minimum for handle

  const formattedAmount = amountZAR.toLocaleString('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  const handleToChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value
    
    if (isHandleFlow) {
      // Always enforce a single @ prefix for handle flow
      if (!value.startsWith('@')) {
        // Remove any existing @ symbols and add one at the start
        value = '@' + value.replace(/^@+/g, '')
      }
      // Ensure only one @ at the start, remove any @ symbols after the first character
      const afterAt = value.slice(1).replace(/@/g, '')
      value = '@' + afterAt
    }
    
    setTo(value)
  }

  const handlePay = () => {
    if (canPay && onPay) {
      onPay({
        to: to.trim(),
        note: note.trim() || undefined,
        amountZAR,
      })
    }
  }

  return (
    <ActionSheet open={open} onClose={onClose} title="" className="send-details">
      <div className="send-details-sheet">
        <div className="send-details-header">
          <button className="send-details-close" onClick={onClose} aria-label="Close">
            <Image src="/assets/clear.svg" alt="" width={18} height={18} />
          </button>
          {sendMethod === 'wallet' ? (
            <div>
              <h3 className="send-details-title">{flowType === 'transfer' ? 'Transfer' : 'Send'}</h3>
              {amountUSDT !== undefined && (
                <p className="send-details-subtitle">{formatUSDT(amountUSDT)}</p>
              )}
            </div>
          ) : (
            <h3 className="send-details-title">
              {flowType === 'transfer' 
                ? `Transfer R${formattedAmount}` 
                : `Send R${formattedAmount}`}
            </h3>
          )}
          <button
            className="send-details-pay"
            disabled={!canPay}
            onClick={handlePay}
            type="button"
          >
            {flowType === 'transfer' ? 'Transfer' : 'Pay'}
          </button>
        </div>
        <div className="send-details-fields">
          <label className="send-details-row">
            <span className="send-details-label">To</span>
            <input
              ref={toRef}
              className="send-details-input"
              placeholder={
                sendMethod === 'wallet' 
                  ? 'USDT address' 
                  : sendMethod === 'brics' 
                  ? '@handle' 
                  : 'email or phone'
              }
              value={to}
              onChange={handleToChange}
              inputMode={sendMethod === 'wallet' ? 'text' : 'email'}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete={sendMethod === 'wallet' ? 'off' : 'email'}
              enterKeyHint="next"
              type="text"
            />
            <div className="send-details-underline" />
            {sendMethod === 'wallet' && <USDTWarningNote />}
          </label>
          {sendMethod !== 'wallet' && (
            <label className="send-details-row">
              <span className="send-details-label">For</span>
              <input
                className="send-details-input"
                placeholder="add a note or reference"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                inputMode="text"
                type="text"
              />
              <div className="send-details-underline" />
            </label>
          )}
        </div>
      </div>
    </ActionSheet>
  )
}


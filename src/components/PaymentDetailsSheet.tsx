'use client'

import { useState, useEffect, useRef } from 'react'
import ActionSheet from './ActionSheet'
import { usePaymentDetailsSheet, type PaymentDetailsMode } from '@/store/usePaymentDetailsSheet'
import { normalizeRecipientInput, validateRecipientInput } from '@/lib/recipientValidation'
import '@/styles/send-details-sheet.css'

const RECIPIENT_PLACEHOLDER = 'Username or WhatsApp number'

type PaymentDetailsSheetProps = {
  onSubmit: (payload: {
    mode: PaymentDetailsMode
    amountZAR: number
    handle: string
  }) => void
}

export default function PaymentDetailsSheet({ onSubmit }: PaymentDetailsSheetProps) {
  const { isOpen, mode, amountZAR, close } = usePaymentDetailsSheet()
  const [recipient, setRecipient] = useState('')
  const [recipientError, setRecipientError] = useState('')
  const recipientRef = useRef<HTMLInputElement>(null)

  // Initialize when sheet opens
  useEffect(() => {
    if (!isOpen) return

    setRecipient('')
    setRecipientError('')
    
    // Focus input field to open keyboard immediately on mobile
    const focusTimer = setTimeout(() => {
      if (recipientRef.current) {
        recipientRef.current.focus()
        if (typeof window !== 'undefined' && 'ontouchstart' in window) {
          setTimeout(() => {
            recipientRef.current?.click()
          }, 50)
        }
      }
    }, 150)
    
    return () => clearTimeout(focusTimer)
  }, [isOpen])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    // Don't normalize on change - let user type freely
    setRecipient(value)
    setRecipientError('')
  }

  // Button is enabled when recipient is valid
  const isValid = validateRecipientInput(recipient)
  const canSubmit = isValid && !recipientError && mode !== null && amountZAR !== null

  const handleSubmit = () => {
    if (!canSubmit || !mode || amountZAR === null) return

    // Normalize the recipient input
    const normalizedRecipient = normalizeRecipientInput(recipient)
    
    // Validate
    if (!validateRecipientInput(normalizedRecipient)) {
      setRecipientError('Enter a valid @username or WhatsApp number')
      return
    }

    // Call parent's onSubmit handler
    onSubmit({
      mode,
      amountZAR,
      handle: normalizedRecipient, // Keep 'handle' name for backward compatibility
    })

    // Close sheet
    close()
  }

  if (!mode) return null

  const labelText = mode === 'pay' ? 'Make payment to' : 'Request payment from'
  const buttonText = mode === 'pay' ? 'Pay' : 'Request'

  return (
    <ActionSheet open={isOpen} onClose={close} title="" className="send-details" size="tall">
      <div className="send-details-sheet">
        <div className="send-details-header">
          {/* Header structure kept for layout, but close button removed - using ActionSheet's .as-close-only */}
        </div>
        <div className="send-details-fields">
          <label className="send-details-row">
            <span className="send-details-label">{labelText}</span>
            <input
              ref={recipientRef}
              className="send-details-input"
              placeholder={RECIPIENT_PLACEHOLDER}
              value={recipient}
              onChange={handleChange}
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              enterKeyHint="done"
              type="text"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canSubmit) {
                  e.preventDefault()
                  handleSubmit()
                }
              }}
            />
            <div className="send-details-underline" />
            {recipientError && (
              <div style={{ marginTop: 4, fontSize: 14, color: '#ff3b30' }}>
                {recipientError}
              </div>
            )}
          </label>

          {/* Submit Button */}
          <div style={{ marginTop: 32, display: 'flex', justifyContent: 'center' }}>
            <button
              className="send-details-pay"
              disabled={!canSubmit}
              onClick={handleSubmit}
              type="button"
              style={{
                width: '100%',
                maxWidth: '382px',
                height: '56px',
                borderRadius: '56px',
                background: canSubmit ? '#FF2D55' : '#E9E9EB',
                color: canSubmit ? '#fff' : '#999',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '0 24px',
                fontSize: '16px',
                fontWeight: 500,
                letterSpacing: '-0.32px',
                cursor: canSubmit ? 'pointer' : 'not-allowed',
              }}
            >
              {buttonText}
            </button>
          </div>
        </div>
      </div>
    </ActionSheet>
  )
}


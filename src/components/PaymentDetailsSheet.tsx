'use client'

import { useState, useEffect, useRef } from 'react'
import ActionSheet from './ActionSheet'
import { usePaymentDetailsSheet, type PaymentDetailsMode } from '@/store/usePaymentDetailsSheet'
import { normalizeHandle, validateHandle } from '@/lib/profile/handleValidation'
import '@/styles/send-details-sheet.css'

type PaymentDetailsSheetProps = {
  onSubmit: (payload: {
    mode: PaymentDetailsMode
    amountZAR: number
    handle: string
  }) => void
}

export default function PaymentDetailsSheet({ onSubmit }: PaymentDetailsSheetProps) {
  const { isOpen, mode, amountZAR, close } = usePaymentDetailsSheet()
  const [handle, setHandle] = useState('')
  const [handleError, setHandleError] = useState('')
  const handleRef = useRef<HTMLInputElement>(null)

  // Initialize when sheet opens
  useEffect(() => {
    if (!isOpen) return

    setHandle('')
    setHandleError('')
    
    // Focus input field to open keyboard immediately on mobile
    const focusTimer = setTimeout(() => {
      if (handleRef.current) {
        handleRef.current.focus()
        if (typeof window !== 'undefined' && 'ontouchstart' in window) {
          setTimeout(() => {
            handleRef.current?.click()
          }, 50)
        }
      }
    }, 150)
    
    return () => clearTimeout(focusTimer)
  }, [isOpen])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    // Normalize on change to enforce @ prefix and character rules
    const normalized = normalizeHandle(value)
    setHandle(normalized)
    setHandleError('')
  }

  // Button is enabled when handle is valid
  const trimmedHandle = handle.trim()
  const normalized = normalizeHandle(trimmedHandle)
  const isValid = validateHandle(normalized)
  const canSubmit = isValid && !handleError && mode !== null && amountZAR !== null

  const handleSubmit = () => {
    if (!canSubmit || !mode || amountZAR === null) return

    // Normalize the handle
    const finalHandle = normalizeHandle(trimmedHandle)
    
    // Validate
    if (!validateHandle(finalHandle)) {
      setHandleError('Handle must start with @ and contain only letters, numbers, and underscores')
      return
    }

    // Call parent's onSubmit handler
    onSubmit({
      mode,
      amountZAR,
      handle: finalHandle,
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
              ref={handleRef}
              className="send-details-input"
              placeholder="@samakoyo"
              value={handle}
              onChange={handleChange}
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="username"
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
            {handleError && (
              <div style={{ marginTop: 4, fontSize: 14, color: '#ff3b30' }}>
                {handleError}
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


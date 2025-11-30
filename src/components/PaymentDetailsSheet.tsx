'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { Check } from 'lucide-react'
import ActionSheet from './ActionSheet'
import { usePaymentDetailsSheet, type PaymentDetailsMode } from '@/store/usePaymentDetailsSheet'
import { normalizeRecipientInput, validateRecipientInput } from '@/lib/recipientValidation'
import '@/styles/send-details-sheet.css'
import styles from './PaymentDetailsSheet.module.css'

const RECIPIENT_PLACEHOLDER = 'Username or WhatsApp number'

type PaymentContact = {
  id: string
  handle: string
  whatsapp: string
  avatarSrc: string
}

const RECENT_CONTACTS: PaymentContact[] = [
  {
    id: 'ama',
    handle: '$ama',
    whatsapp: '+27 63 555 0123',
    avatarSrc: '/assets/Brics-girl-blue.png',
  },
  {
    id: 'ariel',
    handle: '$ariel',
    whatsapp: '+27 73 555 9876',
    avatarSrc: '/assets/avatar - profile (3).png',
  },
]

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
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)
  const recipientRef = useRef<HTMLInputElement>(null)

  // Initialize when sheet opens
  useEffect(() => {
    if (!isOpen) return

    setRecipient('')
    setRecipientError('')
    setSelectedContactId(null)
    
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
    
    // Clear selected contact if user modifies the input away from a known contact
    if (selectedContactId) {
      const selectedContact = RECENT_CONTACTS.find(c => c.id === selectedContactId)
      if (selectedContact && value !== selectedContact.handle) {
        setSelectedContactId(null)
      }
    }
  }

  const handleContactClick = (contact: PaymentContact) => {
    setRecipient(contact.handle)
    setSelectedContactId(contact.id)
    setRecipientError('')
    
    // Move caret to end of input
    if (recipientRef.current) {
      recipientRef.current.focus()
      const length = contact.handle.length
      recipientRef.current.setSelectionRange(length, length)
    }
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
        <div className={styles.sheetContainer}>
          {/* Scrollable main area */}
          <div className={styles.scrollableContent}>
            <div className={styles.inputSection}>
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
            </div>

            {/* Recent contacts list */}
            <div className={styles.contactsList}>
              {RECENT_CONTACTS.map((contact) => {
                const isSelected = selectedContactId === contact.id
                return (
                  <button
                    key={contact.id}
                    type="button"
                    className={`${styles.contactRow} ${isSelected ? styles.contactRowSelected : ''}`}
                    onClick={() => handleContactClick(contact)}
                  >
                    <div className={styles.contactRowLeft}>
                      <div className={styles.avatarWrapper}>
                      <Image
                        src={contact.avatarSrc}
                        alt={contact.handle}
                        width={48}
                        height={48}
                        className={styles.avatar}
                        unoptimized
                      />
                      </div>
                      <div className={styles.contactTextBlock}>
                        <div className={styles.contactHandle}>{contact.handle}</div>
                        <div className={styles.contactWhatsapp}>{contact.whatsapp}</div>
                      </div>
                    </div>
                    {isSelected && (
                      <Check size={18} strokeWidth={2.5} className={styles.checkIcon} />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Fixed bottom footer with button */}
          <div className={styles.bottomFooter}>
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

'use client'

import { useState, useEffect, useRef } from 'react'
import ActionSheet from './ActionSheet'
import { Check, ChevronDown, CreditCard } from 'lucide-react'
import { useCardDetailsSheet } from '@/store/useCardDetailsSheet'
import { useLinkedAccountsSheet } from '@/store/useLinkedAccountsSheet'
import styles from './CardDetailsSheet.module.css'

export default function CardDetailsSheet() {
  const { isOpen, mode, close } = useCardDetailsSheet()
  const { open: openLinkedAccounts } = useLinkedAccountsSheet()
  const cardNumberRef = useRef<HTMLInputElement>(null)

  // Form state
  const [cardNumber, setCardNumber] = useState('')
  const [expDate, setExpDate] = useState('')
  const [cvv, setCvv] = useState('')
  const [country, setCountry] = useState('South Africa')

  // Initialize form when sheet opens
  useEffect(() => {
    if (!isOpen) return

    // Reset form for create mode, or load existing data for edit mode
    if (mode === 'create') {
      setCardNumber('')
      setExpDate('')
      setCvv('')
      setCountry('South Africa')
    }
    // TODO: Load existing card data for edit mode

    // Auto-focus card number input
    const focusTimer = setTimeout(() => {
      if (cardNumberRef.current) {
        cardNumberRef.current.focus()
        // iOS Safari keyboard workaround
        if (typeof window !== 'undefined' && 'ontouchstart' in window) {
          setTimeout(() => {
            cardNumberRef.current?.click()
          }, 50)
        }
      }
    }, 150)

    return () => clearTimeout(focusTimer)
  }, [isOpen, mode])

  // Format card number with spaces (e.g., "5555 2222 0952")
  const formatCardNumber = (value: string) => {
    const digits = value.replace(/\D/g, '')
    const formatted = digits.match(/.{1,4}/g)?.join(' ') || digits
    return formatted.slice(0, 19) // Max 16 digits + 3 spaces
  }

  // Format expiration date (MM/YY)
  const formatExpDate = (value: string) => {
    const digits = value.replace(/\D/g, '')
    if (digits.length <= 2) return digits
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}`
  }

  // Validation
  const validateForm = () => {
    const cardDigits = cardNumber.replace(/\D/g, '')
    const hasValidCardNumber = cardDigits.length >= 12
    const hasValidExpDate = /^\d{2}\/\d{2}$/.test(expDate)
    const hasValidCvv = /^\d{3,4}$/.test(cvv)
    const hasCountry = country.trim() !== ''

    return hasValidCardNumber && hasValidExpDate && hasValidCvv && hasCountry
  }

  const isValid = validateForm()

  const handleClose = () => {
    close()
    // Poll until CardDetailsSheet is closed, then reopen LinkedAccountsSheet
    const checkAndOpen = () => {
      const { isOpen: cardDetailsOpen } = useCardDetailsSheet.getState()
      if (!cardDetailsOpen) {
        openLinkedAccounts()
      } else {
        setTimeout(checkAndOpen, 50)
      }
    }
    setTimeout(checkAndOpen, 100)
  }

  const handleDone = () => {
    if (!isValid) return

    // TODO: Save card data to store/backend
    console.log('Card details saved:', {
      cardNumber: cardNumber.replace(/\D/g, ''),
      expDate,
      cvv,
      country,
    })

    // Close and return to Linked Accounts
    handleClose()
  }

  const handleRemove = () => {
    // TODO: Remove card from store/backend
    console.log('Card removed')

    // Close and return to Linked Accounts
    handleClose()
  }

  return (
    <ActionSheet
      open={isOpen}
      onClose={handleClose}
      title=""
      size="tall"
      className="card-details-sheet"
    >
      <div className={styles.sheetContent}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>Card details</h2>
          <p className={styles.subtitle}>You will link this card to your profile</p>
        </div>

        {/* Card Input Tile */}
        <div className={styles.cardInputWrapper}>
          <div className={styles.cardInput}>
            {/* Card Number */}
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Card number</label>
              <div className={styles.field}>
                <input
                  ref={cardNumberRef}
                  type="text"
                  inputMode="numeric"
                  placeholder="Card number"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                  className={styles.input}
                  maxLength={19}
                />
                <CreditCard size={20} strokeWidth={2} className={styles.cardIcon} />
              </div>
            </div>

            {/* Exp Date + CVV Row */}
            <div className={styles.row}>
              <div className={styles.col}>
                <label className={styles.fieldLabel}>Exp. date</label>
                <div className={styles.field}>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="MM/YY"
                    value={expDate}
                    onChange={(e) => setExpDate(formatExpDate(e.target.value))}
                    className={styles.input}
                    maxLength={5}
                  />
                </div>
              </div>
              <div className={styles.col}>
                <label className={styles.fieldLabel}>CVV</label>
                <div className={styles.field}>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="123"
                    value={cvv}
                    onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className={styles.input}
                    maxLength={4}
                  />
                </div>
              </div>
            </div>

            {/* Country */}
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Country</label>
              <div className={styles.field}>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className={`${styles.input} ${styles.select}`}
                >
                  <option value="South Africa">South Africa</option>
                </select>
                <ChevronDown size={20} strokeWidth={2} className={styles.chevronIcon} />
              </div>
            </div>
          </div>
        </div>

        {/* Footer - Done + Remove */}
        <div className={styles.footer}>
          <button
            className={styles.doneButton}
            disabled={!isValid}
            onClick={handleDone}
            type="button"
          >
            {isValid && <Check size={18} strokeWidth={2.5} />}
            Done
          </button>
          {mode === 'edit' && (
            <button className={styles.removeButton} onClick={handleRemove} type="button">
              Remove card
            </button>
          )}
        </div>
      </div>
    </ActionSheet>
  )
}


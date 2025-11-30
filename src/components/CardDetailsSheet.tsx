'use client'

import { useState, useEffect, useRef } from 'react'
import ActionSheet from './ActionSheet'
import { Check, ChevronDown, CreditCard } from 'lucide-react'
import { useCardDetailsSheet } from '@/store/useCardDetailsSheet'
import { useLinkedAccountsSheet } from '@/store/useLinkedAccountsSheet'
import { useUserProfileStore, type CardBrand } from '@/store/userProfile'
import { COUNTRIES } from '@/constants/countries'
import { CardBrandIcon } from './CardBrandIcon'
import styles from './CardDetailsSheet.module.css'

type CardBrandNullable = CardBrand | null

// Card brand detection helper
const detectCardBrand = (digits: string): CardBrandNullable => {
  if (!digits) return null

  // VISA — starts with 4
  if (/^4[0-9]{3,}$/.test(digits)) return 'visa'

  // AMEX — starts with 34 or 37
  if (/^3[47][0-9]{2,}$/.test(digits)) return 'amex'

  // MASTERCARD — 51–55 or 2221–2720
  if (
    /^(5[1-5][0-9]{2,}|2(2[2-9][0-9]{1,}|[3-6][0-9]{2,}|7[01][0-9]{1,}|720[0-9]{0,}))$/.test(
      digits.slice(0, 6),
    )
  ) {
    return 'mastercard'
  }

  return null
}

export default function CardDetailsSheet() {
  const { isOpen, mode, editingCardId, close } = useCardDetailsSheet()
  const { open: openLinkedAccounts } = useLinkedAccountsSheet()
  const { profile, addOrUpdateCard, removeCard } = useUserProfileStore()
  const cardNumberRef = useRef<HTMLInputElement>(null)

  // Form state
  const [cardNumber, setCardNumber] = useState('')
  const [expDate, setExpDate] = useState('')
  const [cvv, setCvv] = useState('')
  const [country, setCountry] = useState('South Africa')
  const [cardBrand, setCardBrand] = useState<CardBrandNullable>(null)
  const [hasSavedCard, setHasSavedCard] = useState(false)

  // Initialize form when sheet opens
  useEffect(() => {
    if (!isOpen) return

    // Load existing card data if editing
    if (editingCardId) {
      const card = profile.linkedCards.find((c) => c.id === editingCardId)
      if (card) {
        setCardNumber(card.cardNumber || '')
        setExpDate(card.cardExpDate || '')
        setCvv(card.cardCvv || '')
        setCountry(card.cardCountry || 'South Africa')
        setCardBrand(card.brand)
        setHasSavedCard(true)
        
        // Detect brand from existing card number
        if (card.cardNumber) {
          const raw = card.cardNumber.replace(/\s+/g, '')
          setCardBrand(detectCardBrand(raw))
        }
      }
    } else if (mode === 'create') {
      // Reset form for create mode
      setCardNumber('')
      setExpDate('')
      setCvv('')
      setCountry('South Africa')
      setCardBrand(null)
      setHasSavedCard(false)
    }

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
  }, [isOpen, mode, editingCardId, profile.linkedCards])

  // Format card number with spaces (e.g., "5555 2222 0952")
  const formatCardNumber = (value: string) => {
    const digits = value.replace(/\D/g, '')
    const formatted = digits.match(/.{1,4}/g)?.join(' ') || digits
    const result = formatted.slice(0, 19) // Max 16 digits + 3 spaces
    
    // Detect card brand from raw digits
    const raw = digits.slice(0, 16) // Max 16 digits for detection
    setCardBrand(detectCardBrand(raw))
    
    return result
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
    if (!isValid || !cardBrand) return

    const digits = cardNumber.replace(/\s+/g, '')
    const last4 = digits.slice(-4)
    const maskedDisplay = `*******${last4}`

    // Save card to linkedCards array
    addOrUpdateCard({
      id: editingCardId || undefined,
      brand: cardBrand,
      last4,
      maskedDisplay,
      cardNumber: formatCardNumber(cardNumber),
      cardExpDate: expDate,
      cardCvv: cvv,
      cardCountry: country,
    })

    setHasSavedCard(true)

    // Close and return to Linked Accounts
    handleClose()
  }

  const handleRemoveCard = () => {
    if (editingCardId) {
      // Remove card from store
      removeCard(editingCardId)
    }

    // Clear all form fields
    setCardNumber('')
    setExpDate('')
    setCvv('')
    setCountry('South Africa')
    setCardBrand(null)
    setHasSavedCard(false)

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
                <div className={styles.cardIcon}>
                  {cardBrand ? (
                    <CardBrandIcon brand={cardBrand} />
                  ) : (
                    <CreditCard size={20} strokeWidth={2} className={styles.genericCardIcon} />
                  )}
                </div>
              </div>
            </div>

            {/* Exp Date + CVV Row */}
            <div className={styles.row}>
              <div className={`${styles.col} ${styles.expDate}`}>
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
              <div className={`${styles.col} ${styles.cvv}`}>
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
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <ChevronDown size={20} strokeWidth={2} className={styles.chevronIcon} />
              </div>
            </div>
          </div>
        </div>

        {/* Footer - Done + Remove */}
        <div className={styles.footer}>
          <div className={styles.actions}>
            <button
              className={styles.doneButton}
              disabled={!isValid}
              onClick={handleDone}
              type="button"
            >
              {isValid && <Check size={18} strokeWidth={2.5} />}
              Done
            </button>
          </div>
          {hasSavedCard && (
            <button className={styles.removeCardButton} onClick={handleRemoveCard} type="button">
              Remove card
            </button>
          )}
        </div>
      </div>
    </ActionSheet>
  )
}


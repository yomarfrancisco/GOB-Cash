'use client'

import { useState, useEffect, useRef } from 'react'
import ActionSheet from './ActionSheet'
import { Check, ChevronDown } from 'lucide-react'
import { useBankingDetailsSheet } from '@/store/useBankingDetailsSheet'
import { useLinkedAccountsSheet } from '@/store/useLinkedAccountsSheet'
import { useUserProfileStore } from '@/store/userProfile'
import { COUNTRIES } from '@/constants/countries'
import styles from './BankingDetailsSheet.module.css'

export default function BankingDetailsSheet() {
  const { isOpen, mode, editingBankId, close } = useBankingDetailsSheet()
  const { open: openLinkedAccounts } = useLinkedAccountsSheet()
  const { profile, addOrUpdateLinkedBank, removeLinkedBank } = useUserProfileStore()
  const accountHolderRef = useRef<HTMLInputElement>(null)

  // Form state
  const [country, setCountry] = useState('South Africa')
  const [accountHolderName, setAccountHolderName] = useState('')
  const [swiftBic, setSwiftBic] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [hasSavedBank, setHasSavedBank] = useState(false)

  // Initialize form when sheet opens
  useEffect(() => {
    if (!isOpen) return

    // Load existing bank data if editing
    if (editingBankId) {
      const bank = profile.linkedBanks.find((b) => b.id === editingBankId)
      if (bank) {
        setCountry(bank.country || 'South Africa')
        setAccountHolderName(bank.accountHolderName || '')
        setSwiftBic(bank.swiftBic || '')
        setAccountNumber(bank.accountNumber || '')
        setHasSavedBank(true)
      }
    } else if (mode === 'create') {
      // Reset form for create mode
      setCountry('South Africa')
      setAccountHolderName('')
      setSwiftBic('')
      setAccountNumber('')
      setHasSavedBank(false)
    }

    // Auto-focus account holder name input
    const focusTimer = setTimeout(() => {
      if (accountHolderRef.current) {
        accountHolderRef.current.focus()
        // iOS Safari keyboard workaround
        if (typeof window !== 'undefined' && 'ontouchstart' in window) {
          setTimeout(() => {
            accountHolderRef.current?.click()
          }, 50)
        }
      }
    }, 150)

    return () => clearTimeout(focusTimer)
  }, [isOpen, mode, editingBankId, profile.linkedBanks])

  // Validation
  const validateForm = () => {
    const hasCountry = country.trim() !== ''
    const hasAccountHolder = accountHolderName.trim() !== ''
    const hasSwiftBic = swiftBic.trim() !== ''
    const hasAccountNumber = accountNumber.trim() !== ''

    return hasCountry && hasAccountHolder && hasSwiftBic && hasAccountNumber
  }

  const isValid = validateForm()

  const handleClose = () => {
    close()
    // Poll until BankingDetailsSheet is closed, then reopen LinkedAccountsSheet
    const checkAndOpen = () => {
      const { isOpen: bankingDetailsOpen } = useBankingDetailsSheet.getState()
      if (!bankingDetailsOpen) {
        openLinkedAccounts()
      } else {
        setTimeout(checkAndOpen, 50)
      }
    }
    setTimeout(checkAndOpen, 100)
  }

  const handleDone = () => {
    if (!isValid) return

    // Derive bank name from country (simple approach - can be enhanced later)
    const bankName = `${country} Bank` // Placeholder - could be a separate field later

    // Save bank to linkedBanks array
    addOrUpdateLinkedBank({
      id: editingBankId || undefined,
      bankName,
      country,
      swiftBic: swiftBic.trim(),
      accountNumber: accountNumber.trim(),
      accountHolderName: accountHolderName.trim(),
    })

    setHasSavedBank(true)

    // Close and return to Linked Accounts
    handleClose()
  }

  const handleRemoveBank = () => {
    if (editingBankId) {
      // Remove bank from store
      removeLinkedBank(editingBankId)
    }

    // Clear all form fields
    setCountry('South Africa')
    setAccountHolderName('')
    setSwiftBic('')
    setAccountNumber('')
    setHasSavedBank(false)

    // Close and return to Linked Accounts
    handleClose()
  }

  return (
    <ActionSheet
      open={isOpen}
      onClose={handleClose}
      title=""
      size="tall"
      className="banking-details-sheet"
    >
      <div className={styles.sheetContent}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>Banking details</h2>
          <p className={styles.subtitle}>You can top up and payout with this account</p>
        </div>

        {/* Banking Input Tile */}
        <div className={styles.bankingInputWrapper}>
          <div className={styles.bankingInput}>
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

            {/* Account Holder Name */}
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Full name of the account holder</label>
              <div className={styles.field}>
                <input
                  ref={accountHolderRef}
                  type="text"
                  inputMode="text"
                  placeholder="Account holder"
                  value={accountHolderName}
                  onChange={(e) => setAccountHolderName(e.target.value)}
                  className={styles.input}
                />
              </div>
            </div>

            {/* SWIFT / BIC Code */}
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>SWIFT / BIC code</label>
              <div className={styles.field}>
                <input
                  type="text"
                  inputMode="text"
                  placeholder="SWIFT / BIC code"
                  value={swiftBic}
                  onChange={(e) => setSwiftBic(e.target.value.toUpperCase())}
                  className={styles.input}
                />
              </div>
            </div>

            {/* IBAN / Account Number */}
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>IBAN / Account number</label>
              <div className={styles.field}>
                <input
                  type="text"
                  inputMode="text"
                  placeholder="IBAN / Account number"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  className={styles.input}
                />
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
          {hasSavedBank && editingBankId && (
            <button className={styles.removeBankButton} onClick={handleRemoveBank} type="button">
              Remove bank account
            </button>
          )}
        </div>
      </div>
    </ActionSheet>
  )
}


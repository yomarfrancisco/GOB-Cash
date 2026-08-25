'use client'

import { useState, useEffect, useRef } from 'react'
import ActionSheet from './ActionSheet'
import { Check, ChevronDown } from 'lucide-react'
import { useBankingDetailsSheet } from '@/store/useBankingDetailsSheet'
import { useLinkedAccountsSheet } from '@/store/useLinkedAccountsSheet'
import { useWhatsAppClaimStore } from '@/store/useWhatsAppClaim'
import { useUserProfileStore } from '@/store/userProfile'
import { COUNTRIES } from '@/constants/countries'
import { exceedsAvailableZar } from '@/lib/money'
import { useWalletAlloc } from '@/state/walletAlloc'
import { useNotificationStore } from '@/store/notifications'
import styles from './BankingDetailsSheet.module.css'

export default function BankingDetailsSheet() {
  const {
    isOpen,
    mode,
    editingBankId,
    withdrawalAmountZAR,
    withdrawalAmountMZN,
    onWithdrawalCreated,
    close,
  } = useBankingDetailsSheet()
  const { open: openLinkedAccounts } = useLinkedAccountsSheet()
  const { profile, addOrUpdateLinkedBank, removeLinkedBank } = useUserProfileStore()
  const { alloc } = useWalletAlloc()
  const accountHolderRef = useRef<HTMLInputElement>(null)

  // Form state
  const [country, setCountry] = useState('South Africa')
  const [accountHolderName, setAccountHolderName] = useState('')
  const [swiftBic, setSwiftBic] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [hasSavedBank, setHasSavedBank] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Initialize form when sheet opens
  useEffect(() => {
    if (!isOpen) return
    setFormError(null)

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
    } else if (mode === 'create' || mode === 'withdraw') {
      // Reset form for create or withdraw mode
      setCountry('South Africa')
      setAccountHolderName('')
      setSwiftBic('')
      setAccountNumber('')
      setHasSavedBank(false)
    }

    // Removed auto-focus to prevent iOS Safari layout gap on first render
    // Keyboard will open only when user taps an input field
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
    const claim = useWhatsAppClaimStore.getState()
    if (claim.isActive && claim.phase === 'banking') {
      close()
      claim.exitToHome()
      return
    }
    if (claim.isActive) {
      close()
      return
    }

    close()
    // Poll until BankingDetailsSheet is closed, then reopen LinkedAccountsSheet
    const checkAndOpen = () => {
      const { isOpen: bankingDetailsOpen } = useBankingDetailsSheet.getState()
      if (!bankingDetailsOpen) {
        openLinkedAccounts('settings')
      } else {
        setTimeout(checkAndOpen, 50)
      }
    }
    setTimeout(checkAndOpen, 100)
  }

  const handleDone = async () => {
    if (!isValid) return

    // Derive bank name from country (simple approach - can be enhanced later)
    const bankName = `${country} Bank` // Placeholder - could be a separate field later

    // If in withdrawal mode, create withdrawal request and open chat
    if (mode === 'withdraw') {
      if (!withdrawalAmountZAR || withdrawalAmountZAR <= 0) {
        console.error('[BankingDetailsSheet] No withdrawal amount provided')
        return
      }

      const claim = useWhatsAppClaimStore.getState()
      if (claim.isActive) {
        claim.submitBanking({
          country: country.trim(),
          bankName: bankName.trim(),
          accountHolderName: accountHolderName.trim(),
          accountNumber: accountNumber.trim(),
          swiftBic: swiftBic.trim(),
        })
        close()
        return
      }

      if (!withdrawalAmountMZN || withdrawalAmountMZN <= 0) {
        console.error('[BankingDetailsSheet] No MZN source amount provided')
        return
      }

      const availableZar = (alloc.cashCents ?? 0) / 100
      if (exceedsAvailableZar(withdrawalAmountZAR, availableZar)) {
        setFormError('Insufficient ZAR balance.')
        return
      }

      try {
        // Import client function dynamically
        const { tx_createBankWithdrawalRequest } = await import('@/lib/transactions/clientFunctions')
        
        // Create withdrawal request
        const normalizedAccount = accountNumber.replace(/\s+/g, '')
        const matchedBank = profile.linkedBanks.find(
          (bank) => bank.accountNumber.replace(/\s+/g, '') === normalizedAccount
        )

        const result = await tx_createBankWithdrawalRequest({
          amountMZN: withdrawalAmountMZN,
          amountZAR: withdrawalAmountZAR,
          country: country.trim(),
          bankName: bankName.trim(),
          accountHolderName: accountHolderName.trim(),
          accountNumber: accountNumber.trim(),
          swiftBic: swiftBic.trim(),
          linkedBankId: matchedBank?.id ?? editingBankId,
        })

        useNotificationStore.getState().pushNotification({
          id: result.txId,
          kind: 'zar_withdrawn',
          title: 'Withdrawal instructed',
          body: `R${withdrawalAmountZAR.toFixed(2)} to ${accountHolderName.trim()} · ${bankName.trim()}`,
          amount: {
            currency: 'ZAR',
            value: -withdrawalAmountZAR,
          },
          direction: 'down',
          actor: {
            type: 'ai_manager',
            avatar: '/assets/Brics-girl-blue.png',
            name: 'Ama',
          },
          routeOnTap: '/profile?activity=1',
        })

        close()
        
        // Callback to open chat (will be handled by parent via store)
        if (onWithdrawalCreated) {
          onWithdrawalCreated(result.txId)
        }
      } catch (error: any) {
        console.error('[BankingDetailsSheet] Failed to create bank withdrawal:', error)
        const message = String(error?.message || '')
        setFormError(
          /insufficient/i.test(message)
            ? 'Insufficient ZAR balance.'
            : 'Unable to create withdrawal.'
        )
      }
      return
    }

    // For create/edit mode: Save bank to linkedBanks array
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
      <div className={styles.sheetContainer}>
        {/* Scrollable main area */}
        <div className={styles.scrollableContent}>
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
        </div>

        {/* Fixed bottom footer with button */}
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
          {formError && (
            <p className={styles.subtitle}>{formError}</p>
          )}
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


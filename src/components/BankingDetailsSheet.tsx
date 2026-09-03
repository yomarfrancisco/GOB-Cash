'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import ActionSheet from './ActionSheet'
import { Check, ChevronDown } from 'lucide-react'
import { useBankingDetailsSheet } from '@/store/useBankingDetailsSheet'
import { useWhatsAppClaimStore } from '@/store/useWhatsAppClaim'
import { useUserProfileStore } from '@/store/userProfile'
import { COUNTRIES } from '@/constants/countries'
import { exceedsAvailableMzn, exceedsAvailableZar } from '@/lib/money'
import { mznToZar, zarToMzn } from '@/lib/mznZar'
import { useWalletAlloc } from '@/state/walletAlloc'
import { useNotificationStore } from '@/store/notifications'
import { findPayoutBank, getPayoutBanks, type PayoutBank } from '@/config/payoutBanks'
import styles from './BankingDetailsSheet.module.css'

type PayoutCountry = 'Mozambique' | 'South Africa'

function BankMark({ bank }: { bank?: PayoutBank }) {
  if (!bank) return null
  if (bank.logo) {
    return (
      <Image
        src={bank.logo}
        alt=""
        width={28}
        height={28}
        className={styles.bankLogo}
        unoptimized
      />
    )
  }
  return <span className={styles.bankLogoFallback}>{bank.name.charAt(0)}</span>
}

export default function BankingDetailsSheet() {
  const {
    isOpen,
    mode,
    editingBankId,
    withdrawalAmountZAR,
    withdrawalAmountMZN,
    sourceCurrency,
    onDismiss,
    close,
  } = useBankingDetailsSheet()
  const { profile, addOrUpdateLinkedBank, removeLinkedBank } = useUserProfileStore()
  const { alloc } = useWalletAlloc()
  const accountHolderRef = useRef<HTMLInputElement>(null)
  const bankSelectRef = useRef<HTMLDivElement>(null)
  const submittingRef = useRef(false)
  const isWithdraw = mode === 'withdraw'
  const payoutCountry: PayoutCountry = sourceCurrency === 'MZN' ? 'Mozambique' : 'South Africa'
  const isFullCashOut = isWithdraw && sourceCurrency != null
  const payoutBanks = getPayoutBanks(payoutCountry)

  // Form state
  const [country, setCountry] = useState('South Africa')
  const [bankName, setBankName] = useState('')
  const [accountHolderName, setAccountHolderName] = useState('')
  const [swiftBic, setSwiftBic] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [hasSavedBank, setHasSavedBank] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [bankMenuOpen, setBankMenuOpen] = useState(false)

  // Initialize form when sheet opens
  useEffect(() => {
    if (!isOpen) return
    setFormError(null)
    setBankMenuOpen(false)

    // Load existing bank data if editing
    if (editingBankId) {
      const bank = profile.linkedBanks.find((b) => b.id === editingBankId)
      if (bank) {
        setCountry(bank.country || 'South Africa')
        setBankName(bank.bankName || '')
        setAccountHolderName(bank.accountHolderName || '')
        setSwiftBic(bank.swiftBic || '')
        setAccountNumber(bank.accountNumber || '')
        setHasSavedBank(true)
      }
    } else if (mode === 'create' || mode === 'withdraw') {
      setCountry(isWithdraw ? payoutCountry : 'South Africa')
      setBankName(isWithdraw ? (getPayoutBanks(payoutCountry)[0]?.name ?? '') : '')
      setAccountHolderName('')
      setSwiftBic('')
      setAccountNumber('')
      setHasSavedBank(false)
    }

    // Removed auto-focus to prevent iOS Safari layout gap on first render
    // Keyboard will open only when user taps an input field
  }, [isOpen, mode, editingBankId, profile.linkedBanks, isWithdraw, payoutCountry])

  useEffect(() => {
    if (!bankMenuOpen) return
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null
      if (target && bankSelectRef.current?.contains(target)) return
      setBankMenuOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
    }
  }, [bankMenuOpen])

  const validateForm = () => {
    const hasAccountHolder = accountHolderName.trim() !== ''
    const hasAccountNumber = accountNumber.trim() !== ''

    if (isWithdraw) {
      return bankName.trim() !== '' && hasAccountHolder && hasAccountNumber
    }

    const hasCountry = country.trim() !== ''
    const hasSwiftBic = swiftBic.trim() !== ''
    return hasCountry && hasAccountHolder && hasSwiftBic && hasAccountNumber
  }

  const isValid = validateForm()
  const selectedBank = findPayoutBank(payoutCountry, bankName)
  const accountNamePlaceholder = payoutCountry === 'Mozambique' ? 'Empresa Lda' : 'Company (Pty) Ltd'
  const accountNumberPlaceholder = payoutCountry === 'Mozambique'
    ? '0000 0000 0000 0000 000 00'
    : '00000000000'

  const resolvePayoutAmounts = () => {
    if (isFullCashOut) {
      if (sourceCurrency === 'MZN') {
        const amountMZN = (alloc.mznCents ?? 0) / 100
        return { amountMZN, amountZAR: mznToZar(amountMZN) }
      }
      const amountZAR = (alloc.cashCents ?? 0) / 100
      return { amountMZN: zarToMzn(amountZAR), amountZAR }
    }

    return {
      amountMZN: withdrawalAmountMZN ?? 0,
      amountZAR: withdrawalAmountZAR ?? 0,
    }
  }

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

    if (onDismiss) {
      close()
      onDismiss()
      return
    }

    close()
  }

  const handleDone = async () => {
    if (!isValid) return

    const selectedPayoutBank = isWithdraw
      ? findPayoutBank(payoutCountry, bankName.trim())
      : undefined
    const resolvedBankName = isWithdraw
      ? bankName.trim()
      : `${country} Bank`
    const resolvedCountry = isWithdraw ? payoutCountry : country.trim()
    const resolvedSwift = isWithdraw
      ? (selectedPayoutBank?.swift || resolvedBankName)
      : swiftBic.trim()
    const resolvedAccountNumber = accountNumber.trim()

    // If in withdrawal mode, create withdrawal request and open chat
    if (mode === 'withdraw') {
      const { amountMZN, amountZAR } = resolvePayoutAmounts()
      const payoutAmount = sourceCurrency === 'MZN' ? amountMZN : amountZAR
      if (!payoutAmount || payoutAmount <= 0) {
        setFormError(sourceCurrency === 'MZN' ? 'Nothing to withdraw from My MZN.' : 'Nothing to withdraw from My ZAR.')
        return
      }

      const claim = useWhatsAppClaimStore.getState()
      if (claim.isActive) {
        claim.submitBanking({
          country: resolvedCountry,
          bankName: resolvedBankName,
          accountHolderName: accountHolderName.trim(),
          accountNumber: resolvedAccountNumber,
          swiftBic: resolvedSwift,
        })
        close()
        return
      }

      if (submittingRef.current) return

      if (sourceCurrency === 'MZN') {
        const availableMzn = (alloc.mznCents ?? 0) / 100
        if (exceedsAvailableMzn(amountMZN, availableMzn)) {
          setFormError('Insufficient MZN balance.')
          return
        }
      } else {
        const availableZar = (alloc.cashCents ?? 0) / 100
        if (exceedsAvailableZar(amountZAR, availableZar)) {
          setFormError('Insufficient ZAR balance.')
          return
        }
      }

      const payload = {
        amountMZN,
        amountZAR,
        sourceCurrency: (sourceCurrency ?? 'ZAR') as 'MZN' | 'ZAR',
        country: resolvedCountry,
        bankName: resolvedBankName,
        accountHolderName: accountHolderName.trim(),
        accountNumber: resolvedAccountNumber,
        swiftBic: resolvedSwift,
        linkedBankId: profile.linkedBanks.find(
          (bank) => bank.accountNumber.replace(/\s+/g, '') === resolvedAccountNumber.replace(/\s+/g, '')
        )?.id ?? editingBankId,
      }

      submittingRef.current = true
      close()

      void (async () => {
        try {
          const { tx_createBankWithdrawalRequest, downloadBankWithdrawalProof } = await import(
            '@/lib/transactions/clientFunctions'
          )
          const result = await tx_createBankWithdrawalRequest(payload)
          const amountLabel = payload.sourceCurrency === 'MZN'
            ? `Mt ${amountMZN.toFixed(2)}`
            : `R${amountZAR.toFixed(2)}`

          try {
            useNotificationStore.getState().pushNotification({
              id: result.txId,
              kind: 'zar_withdrawn',
              title: 'Withdrawal instructed',
              body: `${amountLabel} to ${payload.accountHolderName} · ${payload.bankName}`,
              amount: {
                currency: payload.sourceCurrency,
                value: payload.sourceCurrency === 'MZN' ? -amountMZN : -amountZAR,
              },
              direction: 'down',
              actor: {
                type: 'ai_manager',
                avatar: '/assets/avatar - profile (2).png',
                name: 'Ama',
              },
              routeOnTap: '/profile?activity=1',
            })
          } catch (error) {
            console.warn('[BankingDetailsSheet] Withdrawal created; notification persist failed.', error)
          }

          void downloadBankWithdrawalProof(result.txId).catch((error) => {
            console.warn('[BankingDetailsSheet] Withdrawal created; confirmation download failed.', error)
          })
        } catch (error: any) {
          console.error('[BankingDetailsSheet] Failed to create bank withdrawal:', error)
          const message = String(error?.message || '')
          useNotificationStore.getState().pushNotification({
            kind: 'payment_failed',
            title: 'Withdrawal failed',
            body: /insufficient/i.test(message)
              ? sourceCurrency === 'MZN'
                ? 'Insufficient MZN balance.'
                : 'Insufficient ZAR balance.'
              : 'Unable to create withdrawal.',
            actor: {
              type: 'system',
              name: 'MozPaga',
            },
          })
        } finally {
          submittingRef.current = false
        }
      })()
      return
    }

    // For create/edit mode: Save bank to linkedBanks array
    addOrUpdateLinkedBank({
      id: editingBankId || undefined,
      bankName: resolvedBankName,
      country,
      swiftBic: resolvedSwift,
      accountNumber: resolvedAccountNumber,
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
    setBankName('')
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
            {isWithdraw ? (
              <Image
                src="/assets/Recipient.png"
                alt="Recipient"
                className={styles.titleMark}
                width={200}
                height={100}
                priority
                unoptimized
              />
            ) : (
              <h2 className={styles.title}>Banking details</h2>
            )}
          </div>

          {/* Banking Input Tile */}
          <div className={styles.bankingInputWrapper}>
            <div className={styles.bankingInput}>
              {isWithdraw ? (
                <>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>Bank</label>
                    <div className={`${styles.field} ${styles.bankSelectWrap}`} ref={bankSelectRef}>
                      <button
                        type="button"
                        className={styles.bankTrigger}
                        onClick={() => setBankMenuOpen((open) => !open)}
                        aria-haspopup="listbox"
                        aria-expanded={bankMenuOpen}
                      >
                        <BankMark bank={selectedBank} />
                        <span className={styles.bankName}>{bankName || 'Bank'}</span>
                      </button>
                      <ChevronDown size={20} strokeWidth={2} className={styles.chevronIcon} />
                      {bankMenuOpen && (
                        <div className={styles.bankMenu} role="listbox">
                          {payoutBanks.map((bank) => (
                            <button
                              key={bank.name}
                              type="button"
                              className={`${styles.bankOption} ${bank.name === bankName ? styles.bankOptionSelected : ''}`}
                              onClick={() => {
                                setBankName(bank.name)
                                setBankMenuOpen(false)
                              }}
                              role="option"
                              aria-selected={bank.name === bankName}
                            >
                              <BankMark bank={bank} />
                              <span className={styles.bankName}>{bank.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>Account name</label>
                    <div className={styles.field}>
                      <input
                        ref={accountHolderRef}
                        type="text"
                        inputMode="text"
                        placeholder={accountNamePlaceholder}
                        value={accountHolderName}
                        onChange={(e) => setAccountHolderName(e.target.value)}
                        className={styles.input}
                      />
                    </div>
                  </div>

                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>
                      {payoutCountry === 'Mozambique' ? 'NIB' : 'Account number'}
                    </label>
                    <div className={styles.field}>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder={accountNumberPlaceholder}
                        value={accountNumber}
                        onChange={(e) => setAccountNumber(e.target.value)}
                        className={styles.input}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
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
                </>
              )}
            </div>
          </div>
        </div>

        {/* Fixed bottom footer with button */}
        <div className={styles.footer}>
          <div className={styles.actions}>
            <button
              className={`${styles.doneButton} ${isValid ? styles.doneButtonReady : ''}`}
              onClick={handleDone}
              type="button"
              aria-disabled={!isValid}
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

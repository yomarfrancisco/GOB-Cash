'use client'

import { useState, useEffect, useRef } from 'react'
import ActionSheet from './ActionSheet'
import { Check, ChevronDown } from 'lucide-react'
import Image from 'next/image'
import { validateTronAddressClient } from '@/lib/validation/tronAddress'
import styles from './UsdtWalletAddressSheet.module.css'

const NETWORKS = [
  { value: 'tron', label: 'TRON', disabled: false },
  { value: 'ethereum', label: 'Ethereum', disabled: true },
  { value: 'solana', label: 'Solana', disabled: true },
] as const

type WithdrawCryptoAddressSheetProps = {
  open: boolean
  onClose: () => void
  onBack?: () => void
  onSubmit: (address: string, network: 'tron') => Promise<void>
  amountUSDT: number
}

export default function WithdrawCryptoAddressSheet({
  open,
  onClose,
  onBack,
  onSubmit,
  amountUSDT,
}: WithdrawCryptoAddressSheetProps) {
  console.log('[WithdrawCryptoAddressSheet] Render - open:', open, 'amountUSDT:', amountUSDT)
  
  const addressRef = useRef<HTMLInputElement>(null)
  const [address, setAddress] = useState('')
  const [network] = useState<'tron'>('tron') // Fixed to TRON
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Log when open prop changes
  useEffect(() => {
    console.log('[WithdrawCryptoAddressSheet] open prop changed to:', open)
  }, [open])

  // Reset form when sheet opens/closes
  useEffect(() => {
    if (!open) {
      setAddress('')
      setError(null)
      setIsSubmitting(false)
    }
  }, [open])

  // Validation
  const validateForm = () => {
    const trimmed = address.trim()
    if (!trimmed) return false
    return validateTronAddressClient(trimmed)
  }

  const isValid = validateForm() && !isSubmitting

  const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAddress(e.target.value)
    setError(null) // Clear error on input change
  }

  const handleDone = async () => {
    if (!isValid) return

    const trimmedAddress = address.trim()
    
    // Double-check validation
    if (!validateTronAddressClient(trimmedAddress)) {
      setError('Invalid TRON address format. Address must start with "T" and be 34 characters.')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      await onSubmit(trimmedAddress, 'tron')
      // Parent handles closing and success notification
    } catch (err: any) {
      console.error('[WithdrawCryptoAddressSheet] Submit error:', err)
      setError(err.message || 'Failed to process withdrawal. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ActionSheet
      open={open}
      onClose={onClose}
      title=""
      size="tall"
      className="usdt-wallet-address-sheet"
    >
      {onBack && (
        <div className="send-details-header">
          <button className="send-details-back" onClick={onBack} aria-label="Back">
            <Image src="/assets/back_ui.svg" alt="" width={24} height={24} />
          </button>
          <h3 className="send-details-title">USDT wallet address</h3>
          <div style={{ width: '32px', height: '32px' }} />
        </div>
      )}
      <div className={styles.sheetContainer}>
        {/* Scrollable main area */}
        <div className={styles.scrollableContent}>
          {/* Header */}
          <div className={styles.header}>
            <p className={styles.subtitle}>Payout USDT into this address</p>
          </div>

          {/* Wallet Input Tile */}
          <div className={styles.walletInputWrapper}>
            <div className={styles.walletInput}>
              {/* USDT Wallet Address */}
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>USDT wallet address</label>
                <div className={styles.field}>
                  <input
                    ref={addressRef}
                    type="text"
                    inputMode="text"
                    placeholder="T..."
                    value={address}
                    onChange={handleAddressChange}
                    className={styles.input}
                    disabled={isSubmitting}
                  />
                </div>
                {error && (
                  <div style={{ 
                    color: '#ff3b30', 
                    fontSize: '14px', 
                    marginTop: '4px',
                    fontFamily: 'Inter, sans-serif'
                  }}>
                    {error}
                  </div>
                )}
              </div>

              {/* Network */}
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Network</label>
                <div className={styles.field}>
                  <select
                    value={network}
                    disabled
                    className={`${styles.input} ${styles.select}`}
                    style={{ opacity: 0.6, cursor: 'not-allowed' }}
                  >
                    {NETWORKS.map((n) => (
                      <option key={n.value} value={n.value} disabled={n.disabled}>
                        {n.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={20} strokeWidth={2} className={styles.chevronIcon} />
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
              {isValid && !isSubmitting && <Check size={18} strokeWidth={2.5} />}
              {isSubmitting ? 'Processing...' : 'Done'}
            </button>
          </div>
        </div>
      </div>
    </ActionSheet>
  )
}


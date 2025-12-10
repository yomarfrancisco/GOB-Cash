'use client'

import { useState, useEffect, useRef } from 'react'
import ActionSheet from './ActionSheet'
import { Check, ChevronDown } from 'lucide-react'
import { useUsdtWalletAddressSheet } from '@/store/useUsdtWalletAddressSheet'
import { useLinkedAccountsSheet } from '@/store/useLinkedAccountsSheet'
import { useUserProfileStore } from '@/store/userProfile'
import styles from './UsdtWalletAddressSheet.module.css'

const NETWORKS = [
  { value: 'ethereum', label: 'Ethereum' },
  { value: 'solana', label: 'Solana' },
  { value: 'tron', label: 'Tron' },
] as const

export default function UsdtWalletAddressSheet() {
  const { isOpen, mode, editingWalletId, close } = useUsdtWalletAddressSheet()
  const { open: openLinkedAccounts } = useLinkedAccountsSheet()
  const { profile, addOrUpdateUsdtWallet, removeUsdtWallet } = useUserProfileStore()
  const addressRef = useRef<HTMLInputElement>(null)

  // Form state
  const [address, setAddress] = useState('')
  const [network, setNetwork] = useState<'ethereum' | 'solana' | 'tron'>('ethereum')
  const [hasSavedWallet, setHasSavedWallet] = useState(false)

  // Initialize form when sheet opens
  useEffect(() => {
    if (!isOpen) return

    // Load existing wallet data if editing
    if (editingWalletId) {
      const wallet = profile.linkedUsdtWallets.find((w) => w.id === editingWalletId)
      if (wallet) {
        setAddress(wallet.address || '')
        setNetwork(wallet.network || 'ethereum')
        setHasSavedWallet(true)
      }
    } else if (mode === 'create') {
      // Reset form for create mode
      setAddress('')
      setNetwork('ethereum')
      setHasSavedWallet(false)
    }

    // Removed auto-focus to prevent iOS Safari layout gap on first render
    // Keyboard will open only when user taps an input field
  }, [isOpen, mode, editingWalletId, profile.linkedUsdtWallets])

  // Validation
  const validateForm = () => {
    const hasAddress = address.trim() !== ''
    const hasNetwork = Boolean(network)

    return hasAddress && hasNetwork
  }

  const isValid = validateForm()

  const handleClose = () => {
    close()
    // Poll until UsdtWalletAddressSheet is closed, then reopen LinkedAccountsSheet
    const checkAndOpen = () => {
      const { isOpen: usdtWalletOpen } = useUsdtWalletAddressSheet.getState()
      if (!usdtWalletOpen) {
        openLinkedAccounts('settings')
      } else {
        setTimeout(checkAndOpen, 50)
      }
    }
    setTimeout(checkAndOpen, 100)
  }

  const handleDone = () => {
    if (!isValid) return

    // Save wallet to linkedUsdtWallets array
    addOrUpdateUsdtWallet({
      id: editingWalletId || undefined,
      address: address.trim(),
      network,
    })

    setHasSavedWallet(true)

    // Close and return to Linked Accounts
    handleClose()
  }

  const handleRemoveWallet = () => {
    if (editingWalletId) {
      // Remove wallet from store
      removeUsdtWallet(editingWalletId)
    }

    // Clear all form fields
    setAddress('')
    setNetwork('ethereum')
    setHasSavedWallet(false)

    // Close and return to Linked Accounts
    handleClose()
  }

  return (
    <ActionSheet
      open={isOpen}
      onClose={handleClose}
      title=""
      size="tall"
      className="usdt-wallet-address-sheet"
    >
      <div className={styles.sheetContainer}>
        {/* Scrollable main area */}
        <div className={styles.scrollableContent}>
          {/* Header */}
          <div className={styles.header}>
            <h2 className={styles.title}>USDT wallet address</h2>
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
                    placeholder="USDT wallet address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className={styles.input}
                  />
                </div>
              </div>

              {/* Network */}
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Network</label>
                <div className={styles.field}>
                  <select
                    value={network}
                    onChange={(e) => setNetwork(e.target.value as 'ethereum' | 'solana' | 'tron')}
                    className={`${styles.input} ${styles.select}`}
                  >
                    {NETWORKS.map((n) => (
                      <option key={n.value} value={n.value}>
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
              {isValid && <Check size={18} strokeWidth={2.5} />}
              Done
            </button>
          </div>
          {hasSavedWallet && editingWalletId && (
            <button className={styles.removeWalletButton} onClick={handleRemoveWallet} type="button">
              Remove wallet address
            </button>
          )}
        </div>
      </div>
    </ActionSheet>
  )
}


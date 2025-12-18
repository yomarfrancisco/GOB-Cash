'use client'

import { useState, useEffect } from 'react'
import ActionSheet from './ActionSheet'
import Image from 'next/image'
import { formatUSDT } from '@/lib/money'
import { tx_withdrawTronUSDT, wallet_ensureTronAddress, type WithdrawTronUsdtResult } from '@/lib/transactions/clientFunctions'
import { useWalletStore } from '@/store/wallets'
import { useAuthStore } from '@/store/auth'
import '@/styles/send-details-sheet.css'

type WithdrawTronUsdtSheetProps = {
  open: boolean
  onClose: () => void
  onSuccess?: (result: WithdrawTronUsdtResult) => void
  onBack?: () => void
}

export default function WithdrawTronUsdtSheet({ 
  open, 
  onClose, 
  onSuccess,
  onBack
}: WithdrawTronUsdtSheetProps) {
  const [amountUSDT, setAmountUSDT] = useState('')
  const [toAddress, setToAddress] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [useMyAddress, setUseMyAddress] = useState(false)
  const [myAddress, setMyAddress] = useState<string | null>(null)
  const [isLoadingAddress, setIsLoadingAddress] = useState(false)
  
  const { wallets, walletsHydrated } = useWalletStore()
  const isAuthed = useAuthStore((state) => state.isAuthed)
  
  // Get user USDT balance
  const userUsdtBalance = isAuthed && walletsHydrated && wallets?.cashZAR
    ? (wallets.cashZAR as any).usdtBalance || 0
    : 0

  // Load user's TRON address when sheet opens
  useEffect(() => {
    if (open && isAuthed) {
      setIsLoadingAddress(true)
      wallet_ensureTronAddress()
        .then(({ address }) => {
          setMyAddress(address)
          setIsLoadingAddress(false)
        })
        .catch((err) => {
          console.error('[WithdrawTronUsdtSheet] Failed to load TRON address:', err)
          setIsLoadingAddress(false)
        })
    }
  }, [open, isAuthed])

  // Reset form when sheet closes
  useEffect(() => {
    if (!open) {
      setAmountUSDT('')
      setToAddress('')
      setError(null)
      setUseMyAddress(false)
      setIsSubmitting(false)
    }
  }, [open])

  // Update toAddress when useMyAddress changes
  useEffect(() => {
    if (useMyAddress && myAddress) {
      setToAddress(myAddress)
    } else if (!useMyAddress) {
      setToAddress('')
    }
  }, [useMyAddress, myAddress])

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    // Allow numbers and decimal point
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setAmountUSDT(value)
      setError(null)
    }
  }

  const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setToAddress(e.target.value.trim())
    setError(null)
    if (useMyAddress) {
      setUseMyAddress(false)
    }
  }

  const canSubmit = 
    amountUSDT && 
    parseFloat(amountUSDT) > 0 && 
    toAddress.length > 0 &&
    !isSubmitting &&
    parseFloat(amountUSDT) <= userUsdtBalance

  const handleSubmit = async () => {
    if (!canSubmit) return

    const amount = parseFloat(amountUSDT)
    if (amount <= 0) {
      setError('Amount must be greater than 0')
      return
    }

    if (amount > userUsdtBalance) {
      setError(`Insufficient balance. Available: ${formatUSDT(userUsdtBalance)}`)
      return
    }

    if (!toAddress || toAddress.length < 33) {
      setError('Invalid TRON address')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const result = await tx_withdrawTronUSDT({
        toAddress,
        amountUSDT: amount,
      })

      if (onSuccess) {
        onSuccess(result)
      }

      // Close sheet on success
      onClose()
    } catch (err: any) {
      console.error('[WithdrawTronUsdtSheet] Withdrawal failed:', err)
      
      // Handle specific error cases
      if (err.code === 'failed-precondition') {
        setError(err.message || 'Insufficient balance')
      } else if (err.code === 'invalid-argument') {
        setError(err.message || 'Invalid address or amount')
      } else {
        setError(err.message || 'Withdrawal failed. Please try again.')
      }
      
      setIsSubmitting(false)
    }
  }

  return (
    <ActionSheet open={open} onClose={onClose} title="" className="send-details" size="tall">
      <div className="send-details-sheet">
        <div className="send-details-header">
          {onBack ? (
            <button className="send-details-back" onClick={onBack} aria-label="Back">
              <Image src="/assets/back_ui.svg" alt="" width={24} height={24} />
            </button>
          ) : (
            <button className="send-details-close" onClick={onClose} aria-label="Close">
              <Image src="/assets/clear.svg" alt="" width={18} height={18} />
            </button>
          )}
          <h3 className="send-details-title">Withdraw USDT (TRON)</h3>
          <button
            className="send-details-pay"
            disabled={!canSubmit}
            onClick={handleSubmit}
            type="button"
          >
            {isSubmitting ? 'Processing...' : 'Withdraw'}
          </button>
        </div>

        <div className="send-details-fields">
          {/* Balance display */}
          <div style={{ 
            padding: '16px 20px',
            background: '#f5f5f5',
            borderRadius: '8px',
            marginBottom: '20px',
            fontSize: '14px',
            color: '#666'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span>Available:</span>
              <span style={{ fontWeight: '600', color: '#000' }}>
                {formatUSDT(userUsdtBalance)}
              </span>
            </div>
          </div>

          {/* Amount input */}
          <div className="send-details-field">
            <label className="send-details-label">Amount (USDT)</label>
            <input
              type="text"
              inputMode="decimal"
              className="send-details-input"
              placeholder="0.00"
              value={amountUSDT}
              onChange={handleAmountChange}
              disabled={isSubmitting}
            />
          </div>

          {/* Use my address option */}
          {myAddress && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                color: '#333'
              }}>
                <input
                  type="checkbox"
                  checked={useMyAddress}
                  onChange={(e) => setUseMyAddress(e.target.checked)}
                  disabled={isSubmitting || isLoadingAddress}
                />
                <span>Use my TRON address</span>
              </label>
              {useMyAddress && (
                <div style={{ 
                  marginTop: '8px',
                  padding: '12px',
                  background: '#f5f5f5',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: '#666',
                  wordBreak: 'break-all'
                }}>
                  {myAddress}
                </div>
              )}
            </div>
          )}

          {/* Address input */}
          <div className="send-details-field">
            <label className="send-details-label">TRON Address</label>
            <input
              type="text"
              className="send-details-input"
              placeholder="T..."
              value={toAddress}
              onChange={handleAddressChange}
              disabled={isSubmitting || (useMyAddress && !!myAddress)}
            />
            <p style={{ 
              marginTop: '4px',
              fontSize: '12px',
              color: '#666'
            }}>
              Enter a TRON (TRC-20) address starting with T
            </p>
          </div>

          {/* Error message */}
          {error && (
            <div style={{
              padding: '12px',
              background: '#fee',
              borderRadius: '6px',
              color: '#c00',
              fontSize: '14px',
              marginTop: '16px'
            }}>
              {error}
            </div>
          )}

          {/* Info about partial fills */}
          <div style={{
            marginTop: '20px',
            padding: '12px',
            background: '#f0f7ff',
            borderRadius: '6px',
            fontSize: '12px',
            color: '#0066cc'
          }}>
            <strong>Note:</strong> If treasury balance is insufficient, your withdrawal may be partially filled. You'll only be charged for the amount actually sent.
          </div>
        </div>
      </div>
    </ActionSheet>
  )
}


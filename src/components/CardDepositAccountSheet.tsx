'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { Check } from 'lucide-react'
import ActionSheet from './ActionSheet'
import { useCardDepositAccountSheet } from '@/store/useCardDepositAccountSheet'
import { useWalletAlloc } from '@/state/walletAlloc'
import { formatZAR } from '@/lib/formatCurrency'
import '@/styles/send-details-sheet.css'
import styles from './CardDepositAccountSheet.module.css'

type AccountType = 'savings' | 'mzn' | 'btc' | 'yield' | 'zwd' | 'yieldSurprise'

type Account = {
  id: AccountType
  label: string
  cardImage: string
  getBalance: () => number
}

// Account configuration for card deposit - only ZAR and MZN accounts
const getDepositAccounts = (getCash: () => number, alloc: { mznCents?: number }): Account[] => [
  {
    id: 'savings',
    label: 'ZAR account',
    cardImage: '/assets/cards/card-savings.jpg',
    getBalance: getCash,
  },
  {
    id: 'mzn',
    label: 'MZN account',
    cardImage: '/assets/cards/card-MZN2.jpg',
    getBalance: () => (alloc.mznCents || 0) / 100,
  },
]

type CardDepositAccountSheetProps = {
  onConfirm: (payload: { amountZAR: number; accountId: string; accountLabel: string }) => void
}

export default function CardDepositAccountSheet({ onConfirm }: CardDepositAccountSheetProps) {
  const { isOpen, amountZAR, close } = useCardDepositAccountSheet()
  const { getCash, alloc } = useWalletAlloc()
  const [selectedAccountId, setSelectedAccountId] = useState<AccountType | null>(null)
  const [selectedAccountLabel, setSelectedAccountLabel] = useState<string>('')
  const inputRef = useRef<HTMLInputElement>(null)

  const accounts = getDepositAccounts(getCash, alloc)

  // Reset selection when sheet opens - default to ZAR account
  useEffect(() => {
    if (isOpen) {
      const zarAccount = accounts.find((a) => a.id === 'savings')
      if (zarAccount) {
        setSelectedAccountId('savings')
        setSelectedAccountLabel(zarAccount.label)
      } else {
        setSelectedAccountId(null)
        setSelectedAccountLabel('')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]) // Only reset when sheet opens/closes, not when accounts array changes

  const handleAccountClick = (account: Account) => {
    setSelectedAccountId(account.id)
    setSelectedAccountLabel(account.label)
  }

  const handleConfirm = () => {
    if (!selectedAccountId || amountZAR === null) return

    const account = accounts.find((a) => a.id === selectedAccountId)
    if (!account) return

    onConfirm({
      amountZAR,
      accountId: selectedAccountId,
      accountLabel: account.label,
    })

    close()
  }

  const canSubmit = selectedAccountId !== null && amountZAR !== null

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
                <span className="send-details-label">Deposit into account</span>
                <input
                  ref={inputRef}
                  className="send-details-input"
                  placeholder="Select account"
                  value={selectedAccountLabel}
                  onChange={() => {}}
                  readOnly
                  inputMode="text"
                  type="text"
                />
                <div className="send-details-underline" />
              </label>
            </div>

            {/* Account list */}
            <div className={styles.accountsList}>
              {accounts.map((account) => {
                const isSelected = selectedAccountId === account.id
                const balance = account.getBalance()
                const { major, cents } = formatZAR(balance)
                const balanceText = `Balance: R ${major}.${cents}`

                return (
                  <button
                    key={account.id}
                    type="button"
                    className={`${styles.accountRow} ${isSelected ? styles.accountRowSelected : ''}`}
                    onClick={() => handleAccountClick(account)}
                  >
                    <div className={styles.accountLeft}>
                      <div className={styles.cardImageWrapper}>
                        <Image
                          src={account.cardImage}
                          alt={account.label}
                          width={40}
                          height={26}
                          className={styles.cardImage}
                          unoptimized
                        />
                      </div>
                      <div className={styles.accountTextBlock}>
                        <div className={styles.accountTitle}>{account.label}</div>
                        <div className={styles.accountSubtitle}>{balanceText}</div>
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
              onClick={handleConfirm}
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
              Deposit
            </button>
          </div>
        </div>
      </div>
    </ActionSheet>
  )
}

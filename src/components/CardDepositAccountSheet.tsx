'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { Check } from 'lucide-react'
import ActionSheet from './ActionSheet'
import { useCardDepositAccountSheet } from '@/store/useCardDepositAccountSheet'
import '@/styles/send-details-sheet.css'
import styles from './CardDepositAccountSheet.module.css'

type Account = {
  id: string
  label: string
  subtitle: string
  cardImage?: string
}

// TODO: Replace with real wallet/card data from store
const ACCOUNTS: Account[] = [
  {
    id: 'personal',
    label: 'Personal wallet',
    subtitle: '0% transfer fee',
    cardImage: '/assets/cards/card-GOB.png',
  },
  {
    id: 'dealer',
    label: 'Dealer account',
    subtitle: 'R1220.99',
    cardImage: '/assets/cards/card-GOB.png',
  },
]

type CardDepositAccountSheetProps = {
  onConfirm: (payload: { amountZAR: number; accountId: string; accountLabel: string }) => void
}

export default function CardDepositAccountSheet({ onConfirm }: CardDepositAccountSheetProps) {
  const { isOpen, amountZAR, close } = useCardDepositAccountSheet()
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)

  // Reset selection when sheet opens
  useEffect(() => {
    if (isOpen) {
      setSelectedAccountId(null)
    }
  }, [isOpen])

  const handleAccountClick = (accountId: string) => {
    setSelectedAccountId(accountId)
  }

  const handleConfirm = () => {
    if (!selectedAccountId || amountZAR === null) return

    const account = ACCOUNTS.find((a) => a.id === selectedAccountId)
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
        <div className={styles.sheetContainer}>
          {/* Scrollable main area */}
          <div className={styles.scrollableContent}>
            <div className={styles.header}>
              <h2 className={styles.title}>Deposit into</h2>
            </div>

            {/* Account list */}
            <div className={styles.accountsList}>
              {ACCOUNTS.map((account) => {
                const isSelected = selectedAccountId === account.id
                return (
                  <button
                    key={account.id}
                    type="button"
                    className={`${styles.accountRow} ${isSelected ? styles.accountRowSelected : ''}`}
                    onClick={() => handleAccountClick(account.id)}
                  >
                    <div className={styles.accountLeft}>
                      <div className={styles.cardImageWrapper}>
                        {account.cardImage ? (
                          <Image
                            src={account.cardImage}
                            alt={account.label}
                            width={48}
                            height={32}
                            style={{ objectFit: 'contain' }}
                            unoptimized
                          />
                        ) : (
                          <div className={styles.cardPlaceholder} />
                        )}
                      </div>
                      <div className={styles.accountText}>
                        <div className={styles.accountLabel}>{account.label}</div>
                        <div className={styles.accountSubtitle}>{account.subtitle}</div>
                      </div>
                    </div>
                    {isSelected && (
                      <div className={styles.checkIcon}>
                        <Check size={20} strokeWidth={2.5} />
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Fixed bottom footer */}
          <div className={styles.bottomFooter}>
            <button
              className={`${styles.depositButton} ${canSubmit ? styles.depositButtonEnabled : styles.depositButtonDisabled}`}
              onClick={handleConfirm}
              disabled={!canSubmit}
              type="button"
            >
              {canSubmit && <Check size={18} strokeWidth={2.5} style={{ marginRight: 8 }} />}
              Deposit
            </button>
          </div>
        </div>
      </div>
    </ActionSheet>
  )
}


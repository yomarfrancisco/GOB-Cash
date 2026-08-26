'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { Check } from 'lucide-react'
import ActionSheet from './ActionSheet'
import { usePayIntoSheet, type ConversionDestination } from '@/store/usePayIntoSheet'
import { useWalletAlloc } from '@/state/walletAlloc'
import { formatMZN, formatZARWithDot } from '@/lib/money'
import { quotedMznPerZarForDestination } from '@/lib/mznZar'
import { useFxRates } from '@/lib/exchangeRates/useFxRates'
import '@/styles/send-details-sheet.css'
import styles from './CardDepositAccountSheet.module.css'

type Account = {
  id: ConversionDestination
  label: string
  cardImage: string
  getBalanceText: () => string
}

type PayIntoSheetProps = {
  onConfirm: (destination: ConversionDestination) => void
}

export default function PayIntoSheet({ onConfirm }: PayIntoSheetProps) {
  const { isOpen, close, setDestination, destination } = usePayIntoSheet()
  const { getCash, alloc } = useWalletAlloc()
  const { rates: fxRates } = useFxRates(['MZN'])
  const [selectedId, setSelectedId] = useState<ConversionDestination>('ZAR')

  const zarAccount: Account = {
    id: 'ZAR',
    label: 'ZAR account',
    cardImage: '/assets/cards/card-savings.jpg',
    getBalanceText: () => `Balance: ${formatZARWithDot(getCash())}`,
  }
  const mznAccount: Account = {
    id: 'MZN',
    label: 'MZN account',
    cardImage: '/assets/cards/card-MZN2.jpg',
    getBalanceText: () => `Balance: ${formatMZN((alloc.mznCents || 0) / 100)}`,
  }
  const accounts = selectedId === 'MZN' ? [mznAccount, zarAccount] : [zarAccount, mznAccount]

  useEffect(() => {
    if (isOpen) setSelectedId(destination)
  }, [isOpen, destination])

  const title = selectedId === 'ZAR' ? 'Convert MZN' : 'Convert ZAR'
  const liveMzn =
    typeof fxRates?.rates?.MZN === 'number' && fxRates.rates.MZN > 0
      ? fxRates.rates.MZN
      : 0
  const quotedMznPerZar = quotedMznPerZarForDestination(liveMzn, selectedId)
  const rateText = `@ ${quotedMznPerZar.toFixed(2)} Mt/R`

  const handleConfirm = () => {
    setDestination(selectedId)
    onConfirm(selectedId)
    close()
  }

  return (
    <ActionSheet open={isOpen} onClose={close} title="" className="send-details" size="tall">
      <div className="send-details-sheet">
        <div className="send-details-header" />
        <div className={styles.sheetContainer}>
          <div className={styles.scrollableContent}>
            <div className={styles.inputSection}>
              <label className="send-details-row">
                <span className={`send-details-label ${styles.convertLabel}`}>{title}</span>
                <div className={styles.receiveBlock}>
                  <div className={styles.receiveLine}>{rateText}</div>
                </div>
                <div className="send-details-underline" />
              </label>
            </div>

            <div className={styles.accountsList}>
              {accounts.map((account) => {
                const isSelected = selectedId === account.id
                return (
                  <button
                    key={account.id}
                    type="button"
                    className={`${styles.accountRow} ${isSelected ? styles.accountRowSelected : ''}`}
                    onClick={() => setSelectedId(account.id)}
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
                        <div className={styles.accountSubtitle}>{account.getBalanceText()}</div>
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

          <div className={styles.bottomFooter}>
            <button
              className="send-details-pay"
              onClick={handleConfirm}
              type="button"
              style={{
                width: '100%',
                maxWidth: '382px',
                height: '56px',
                borderRadius: '56px',
                background: '#FF2D55',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 24px',
                fontSize: '16px',
                fontWeight: 500,
                letterSpacing: '-0.32px',
                cursor: 'pointer',
              }}
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    </ActionSheet>
  )
}

'use client'

import { useState, useMemo } from 'react'
import Image from 'next/image'
import { ChevronDown, ChevronRight } from 'lucide-react'
import ActionSheet from './ActionSheet'
import { useWalletAlloc } from '@/state/walletAlloc'
import { formatZAR } from '@/lib/formatCurrency'
import styles from './InternalTransferSheet.module.css'

type WalletId = 'savings' | 'pepe' | 'yield' | 'mzn' | 'btc'

type Wallet = {
  id: WalletId
  name: string
  cardImage: string
  balanceCents: number
}

type InternalTransferSheetProps = {
  open: boolean
  onClose: () => void
  onNext: (fromWalletId: WalletId, toWalletId: WalletId) => void
  defaultFromWalletId?: WalletId // Current active card from home screen
}

const WALLET_CONFIG: Record<WalletId, { name: string; cardImage: string; allocKey: 'cashCents' | 'ethCents' | 'pepeCents' | 'mznCents' | 'btcCents' }> = {
  savings: { name: 'ZAR wallet', cardImage: '/assets/cards/card-savings.jpg', allocKey: 'cashCents' },
  pepe: { name: 'PEPE wallet', cardImage: '/assets/cards/card-pepe.jpg', allocKey: 'pepeCents' },
  yield: { name: 'ETH wallet', cardImage: '/assets/cards/card-ETH.jpg', allocKey: 'ethCents' },
  mzn: { name: 'MZN wallet', cardImage: '/assets/cards/card-MZN.jpg', allocKey: 'mznCents' },
  btc: { name: 'BTC wallet', cardImage: '/assets/cards/card-BTC.jpg', allocKey: 'btcCents' },
}

export default function InternalTransferSheet({ open, onClose, onNext, defaultFromWalletId = 'savings' }: InternalTransferSheetProps) {
  const { alloc } = useWalletAlloc()
  const [fromWalletId, setFromWalletId] = useState<WalletId>(defaultFromWalletId)
  const [toWalletId, setToWalletId] = useState<WalletId>(() => {
    // Default to next wallet in list, or first different wallet
    const walletIds: WalletId[] = ['savings', 'pepe', 'yield', 'mzn', 'btc']
    const currentIndex = walletIds.indexOf(defaultFromWalletId)
    return walletIds[(currentIndex + 1) % walletIds.length]
  })
  const [expandedPicker, setExpandedPicker] = useState<'from' | 'to' | null>(null)

  // Build wallet list with balances
  const wallets = useMemo<Wallet[]>(() => {
    const walletIds: WalletId[] = ['savings', 'pepe', 'yield', 'mzn', 'btc']
    return walletIds.map((id) => {
      const config = WALLET_CONFIG[id]
      const balanceCents = alloc[config.allocKey] || 0
      return {
        id,
        name: config.name,
        cardImage: config.cardImage,
        balanceCents,
      }
    })
  }, [alloc])

  const fromWallet = wallets.find((w) => w.id === fromWalletId)!
  const toWallet = wallets.find((w) => w.id === toWalletId)!

  const handleFromClick = () => {
    setExpandedPicker(expandedPicker === 'from' ? null : 'from')
  }

  const handleToClick = () => {
    setExpandedPicker(expandedPicker === 'to' ? null : 'to')
  }

  const handleSelectWallet = (walletId: WalletId, type: 'from' | 'to') => {
    if (type === 'from') {
      // Prevent selecting same wallet as "to"
      if (walletId === toWalletId) {
        // Swap them instead
        setToWalletId(fromWalletId)
      }
      setFromWalletId(walletId)
    } else {
      // Prevent selecting same wallet as "from"
      if (walletId === fromWalletId) {
        // Swap them instead
        setFromWalletId(toWalletId)
      }
      setToWalletId(walletId)
    }
    setExpandedPicker(null)
  }

  const handleNext = () => {
    onNext(fromWalletId, toWalletId)
  }

  const formatBalance = (cents: number) => {
    const formatted = formatZAR(cents / 100)
    return `R${formatted.major.replace(/\s/g, '')}.${formatted.cents}`
  }

  return (
    <ActionSheet open={open} onClose={onClose} title="" size="compact">
      <div className={styles.transferSheet}>
        {/* Title row */}
        <div className={styles.headerMain}>
          <h2 className={styles.title}>Transfer</h2>
        </div>

        <div className={styles.content}>

        {/* FROM section */}
        <section className={styles.section}>
          <div className={styles.sectionLabel}>From</div>
          <button
            className={styles.walletRow}
            onClick={handleFromClick}
            type="button"
          >
            <div className={styles.walletRowLeft}>
              <div className={styles.cardThumbnail}>
                <Image
                  src={fromWallet.cardImage}
                  alt={fromWallet.name}
                  fill
                  className={styles.cardImage}
                  sizes="72px"
                  unoptimized
                />
              </div>
              <div className={styles.walletText}>
                <div className={styles.walletName}>{fromWallet.name}</div>
                <div className={styles.walletBalance}>{formatBalance(fromWallet.balanceCents)}</div>
                <div className={styles.walletMeta}>0% transfer fee</div>
              </div>
            </div>
            <ChevronDown size={20} strokeWidth={2} className={styles.chevron} />
          </button>

          {/* FROM wallet picker */}
          {expandedPicker === 'from' && (
            <div className={styles.walletPicker}>
              {wallets.map((wallet) => (
                <button
                  key={wallet.id}
                  className={styles.walletPickerRow}
                  onClick={() => handleSelectWallet(wallet.id, 'from')}
                  disabled={wallet.id === fromWalletId}
                  type="button"
                >
                  <div className={styles.walletRowLeft}>
                    <div className={styles.cardThumbnail}>
                      <Image
                        src={wallet.cardImage}
                        alt={wallet.name}
                        fill
                        className={styles.cardImage}
                        sizes="48px"
                        unoptimized
                      />
                    </div>
                    <div className={styles.walletText}>
                      <div className={styles.walletName}>{wallet.name}</div>
                      <div className={styles.walletBalance}>{formatBalance(wallet.balanceCents)}</div>
                    </div>
                  </div>
                  {wallet.id === fromWalletId && (
                    <div className={styles.selectedIndicator}>✓</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* TO section */}
        <section className={styles.section}>
          <div className={styles.sectionLabel}>To</div>
          <button
            className={styles.walletRow}
            onClick={handleToClick}
            type="button"
          >
            <div className={styles.walletRowLeft}>
              <div className={styles.cardThumbnail}>
                <Image
                  src={toWallet.cardImage}
                  alt={toWallet.name}
                  fill
                  className={styles.cardImage}
                  sizes="72px"
                  unoptimized
                />
              </div>
              <div className={styles.walletText}>
                <div className={styles.walletName}>{toWallet.name}</div>
                <div className={styles.walletBalance}>{formatBalance(toWallet.balanceCents)}</div>
              </div>
            </div>
            <ChevronDown size={20} strokeWidth={2} className={styles.chevron} />
          </button>

          {/* TO wallet picker */}
          {expandedPicker === 'to' && (
            <div className={styles.walletPicker}>
              {wallets.map((wallet) => (
                <button
                  key={wallet.id}
                  className={styles.walletPickerRow}
                  onClick={() => handleSelectWallet(wallet.id, 'to')}
                  disabled={wallet.id === toWalletId}
                  type="button"
                >
                  <div className={styles.walletRowLeft}>
                    <div className={styles.cardThumbnail}>
                      <Image
                        src={wallet.cardImage}
                        alt={wallet.name}
                        fill
                        className={styles.cardImage}
                        sizes="48px"
                        unoptimized
                      />
                    </div>
                    <div className={styles.walletText}>
                      <div className={styles.walletName}>{wallet.name}</div>
                      <div className={styles.walletBalance}>{formatBalance(wallet.balanceCents)}</div>
                    </div>
                  </div>
                  {wallet.id === toWalletId && (
                    <div className={styles.selectedIndicator}>✓</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Footer */}
        <footer className={styles.footer}>
          <div className={styles.instantTransfer}>Instant transfer</div>
          <button
            className={styles.nextButton}
            onClick={handleNext}
            type="button"
          >
            <span>Next</span>
            <ChevronRight size={20} strokeWidth={2} style={{ color: '#000' }} />
          </button>
        </footer>
        </div>
      </div>
    </ActionSheet>
  )
}


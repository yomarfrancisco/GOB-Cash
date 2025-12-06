'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { ChevronRight } from 'lucide-react'
import ActionSheet from './ActionSheet'
import styles from './WalletHelperSheet.module.css'
import { type CardType } from './CardStack'

// Unify WalletKey with CardType - every card corresponds to a wallet key
export type WalletKey = CardType

// Ordered sequence of wallets for navigation
const WALLET_SEQUENCE: WalletKey[] = [
  'savings',      // ZAR wallet
  'mzn',          // MZN wallet
  'zwd',          // ZWD wallet
  'yield',        // ETH wallet
  'btc',          // BTC wallet
  'yieldSurprise' // Earnings wallet
]

type WalletHelperSheetProps = {
  walletKey: WalletKey | null
  onClose: () => void
}

const walletTitleMap: Record<WalletKey, string> = {
  savings: 'ZAR wallet',
  mzn: 'MZN wallet',
  zwd: 'ZWD wallet',
  yield: 'ETH wallet',
  btc: 'BTC wallet',
  yieldSurprise: 'Earnings wallet',
}

const cardImages: Record<WalletKey, string> = {
  savings: '/assets/cards/card-savings.jpg',
  zwd: '/assets/cards/card-ZIM5.jpg',
  yield: '/assets/cards/card-ETH.jpg',
  mzn: '/assets/cards/card-MZN.jpg',
  btc: '/assets/cards/card-BTC.jpg',
  yieldSurprise: '/assets/cards/card-$GOB4.jpg', // New wallet key using yield card art
}

export default function WalletHelperSheet({ walletKey, onClose }: WalletHelperSheetProps) {
  const [sequence, setSequence] = useState<WalletKey[]>([])
  const [sequenceIndex, setSequenceIndex] = useState<number>(0)

  // Build circular sequence starting from entry point
  useEffect(() => {
    if (walletKey) {
      const entryIndex = WALLET_SEQUENCE.indexOf(walletKey)
      
      if (entryIndex === -1) {
        // Fallback: if key not found, use first wallet
        setSequence(WALLET_SEQUENCE)
        setSequenceIndex(0)
        return
      }

      // Build circular sequence: entryIndex, entryIndex+1, ..., N-1, 0, 1, ..., entryIndex-1
      const N = WALLET_SEQUENCE.length
      const circularSequence: WalletKey[] = []
      
      for (let i = 0; i < N; i++) {
        const index = (entryIndex + i) % N
        circularSequence.push(WALLET_SEQUENCE[index])
      }

      setSequence(circularSequence)
      setSequenceIndex(0)
    } else {
      setSequence([])
      setSequenceIndex(0)
    }
  }, [walletKey])

  if (sequence.length === 0 || sequenceIndex >= sequence.length) return null

  const currentWalletKey = sequence[sequenceIndex]
  const title = walletTitleMap[currentWalletKey]
  const cardImage = cardImages[currentWalletKey]

  // Check if we're on the last item in the sequence
  const isLast = sequenceIndex === sequence.length - 1

  const handleNext = () => {
    if (isLast) {
      onClose()
      return
    }

    // Advance to next item in sequence
    setSequenceIndex((prev) => prev + 1)
  }

  const primaryCtaLabel = isLast ? 'Done' : 'Next'

  // Content varies by wallet type
  const isZARWallet = currentWalletKey === 'savings'
  
  const descriptionText = isZARWallet
    ? 'A rand savings wallet that pays 9% annual yield on your balance while letting you save, spend, and pay anyone on Gobankless.'
    : 'A savings account that earns interest on your deposits while enabling you to make direct payments on the app'

  const tile2Line2Text = isZARWallet
    ? 'Move money in or out at any time at no extra cost'
    : 'Withdraw anytime at no additional cost'

  return (
    <ActionSheet open={!!walletKey} onClose={onClose} title={title} size="tall">
      <div className={styles.content}>
        <div className={styles.tiles}>
          {/* Descriptive paragraph */}
          <p className={styles.description}>
            {descriptionText}
          </p>

          {/* Tile 1: Card + APY */}
          <div className={styles.tile}>
            <div className={styles.cardPreviewContainer}>
              {/* Dark pill with APY */}
              <div className={styles.apyPill}>
                <span className={styles.apyPercentage}>9.38%</span>
                <span className={styles.apyLabel}>annual yield</span>
              </div>
              {/* Card preview - showing top third/half */}
              <div className={styles.cardPreview}>
                <Image
                  src={cardImage}
                  alt={title}
                  fill
                  className={styles.cardImage}
                  sizes="204px"
                  unoptimized
                />
              </div>
            </div>
            <h3 className={styles.apyHeading}>Earn 9% annually on your deposits</h3>
            <p className={styles.apySubtext}>Compounded monthly</p>
          </div>

          {/* Tile 2: Anytime */}
          <div className={styles.tile}>
            <h3 className={styles.tileTitle}>Anytime</h3>
            <p className={styles.tileLine1}>Access to funds</p>
            <p className={styles.tileLine2}>{tile2Line2Text}</p>
          </div>

          {/* Tile 3: 0% */}
          <div className={styles.tile}>
            <h3 className={styles.tileTitle}>0%</h3>
            <p className={styles.tileLine1}>Tax on interest earned</p>
          </div>

          {/* Tile 4: Zero */}
          <div className={styles.tile}>
            <h3 className={styles.tileTitle}>Zero</h3>
            <p className={styles.tileLine1}>Fees on payments</p>
            <p className={styles.tileLine2}>Pay any Gobankless account for free</p>
          </div>
        </div>

        {/* Footer with gradient fade */}
        <div className={styles.pageFooter}>
          <div className={styles.pageParent}>
            <div className={styles.lButtonWrapper}>
              <button
                type="button"
                className={`${styles.lButton} ${isLast ? styles.lButtonDone : ''}`}
                onClick={handleNext}
              >
                <div className={styles.lButtonContent}>
                  <span className={styles.lBold}>{primaryCtaLabel}</span>
                  {!isLast && (
                    <ChevronRight size={24} strokeWidth={2} className={styles.ico24ArrowsNextUi} />
                  )}
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </ActionSheet>
  )
}


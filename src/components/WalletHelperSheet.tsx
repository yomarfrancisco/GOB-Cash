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
  const isETHWallet = currentWalletKey === 'yield'
  const isEarningsWallet = currentWalletKey === 'yieldSurprise'
  
  // Description text
  const descriptionText = isZARWallet
    ? 'A RAND savings account that pays you high yield from Gobankless agent fees while still letting you pay and withdraw in cash.'
    : isETHWallet
    ? 'An ETH savings wallet that lets you earn high yield while keeping your balance in crypto you can spend or withdraw.'
    : isEarningsWallet
    ? 'Your Earnings wallet is where Gobankless deposits the fees you earn from helping customers move cash to and from crypto.'
    : 'A savings account that earns interest on your deposits while enabling you to make direct payments on the app'

  // APY values vary by wallet type
  const apyPercentage = isZARWallet 
    ? '18.0%' 
    : isETHWallet 
    ? '22.0%' 
    : isEarningsWallet 
    ? '25.0%' 
    : '9.38%'
    
  const apyHeading = isZARWallet 
    ? 'Earn 18% annually on your deposits'
    : isETHWallet
    ? 'Earn 22% annually on your deposits'
    : isEarningsWallet
    ? 'Turn your shifts into 25% annual yield'
    : 'Earn 9% annually on your deposits'
    
  const apySubtext = isZARWallet
    ? 'Compounded monthly in RAND'
    : isETHWallet
    ? 'Compounded monthly in ETH'
    : isEarningsWallet
    ? 'Compounded as your agent earnings grow'
    : 'Compounded monthly'

  // Tile 2 content
  const tile2Line1 = isZARWallet
    ? 'Instant access to your cash'
    : isETHWallet
    ? 'Access to your ETH'
    : isEarningsWallet
    ? 'Access to your earnings'
    : 'Access to funds'
    
  const tile2Line2 = isZARWallet
    ? 'Withdraw or spend anytime at no additional cost'
    : isETHWallet
    ? 'Move or withdraw anytime at no additional cost'
    : isEarningsWallet
    ? 'Withdraw to cash or crypto anytime at no additional cost'
    : 'Withdraw anytime at no additional cost'

  // Tile 3 content
  const tile3Line1 = isZARWallet
    ? 'Tax on interest earned'
    : isETHWallet
    ? 'Gobankless fees on interest earned'
    : isEarningsWallet
    ? 'Account fees on earnings'
    : 'Tax on interest earned'

  // Tile 4 content
  const tile4Line1 = isZARWallet
    ? 'Fees on payments'
    : isETHWallet
    ? 'Fees on payments'
    : isEarningsWallet
    ? 'Fees on Gobankless payouts'
    : 'Fees on payments'
    
  const tile4Line2 = isZARWallet
    ? 'Pay any Gobankless account for free'
    : isETHWallet
    ? 'Pay any Gobankless account for free'
    : isEarningsWallet
    ? 'Keep 100% of what you earn from your shifts'
    : 'Pay any Gobankless account for free'

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
                <span className={styles.apyPercentage}>{apyPercentage}</span>
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
            <h3 className={styles.apyHeading}>{apyHeading}</h3>
            <p className={styles.apySubtext}>{apySubtext}</p>
          </div>

          {/* Tile 2: Anytime */}
          <div className={styles.tile}>
            <h3 className={styles.tileTitle}>Anytime</h3>
            <p className={styles.tileLine1}>{tile2Line1}</p>
            <p className={styles.tileLine2}>{tile2Line2}</p>
          </div>

          {/* Tile 3: 0% */}
          <div className={styles.tile}>
            <h3 className={styles.tileTitle}>0%</h3>
            <p className={styles.tileLine1}>{tile3Line1}</p>
          </div>

          {/* Tile 4: Zero */}
          <div className={styles.tile}>
            <h3 className={styles.tileTitle}>Zero</h3>
            <p className={styles.tileLine1}>{tile4Line1}</p>
            <p className={styles.tileLine2}>{tile4Line2}</p>
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


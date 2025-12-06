'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { ChevronRight } from 'lucide-react'
import ActionSheet from './ActionSheet'
import styles from './WalletHelperSheet.module.css'
import { type CardType } from './CardStack'
import { getCardDefinition } from '@/lib/cards/cardDefinitions'

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

// Helper tile structure
type HelperTile = {
  title: string
  line1?: string
  line2?: string
}

// Helper copy structure
type HelperCopy = {
  description: string
  apyHeading: string
  apySubtext: string
  tiles: HelperTile[] // tiles[0] is the APY card; tiles[1..] the lower tiles
}

// Centralized copy map for all wallet helpers
const HELPER_COPY: Record<WalletKey, HelperCopy> = {
  savings: {
    description: 'A Rand savings wallet that earns strong yield on your deposits while enabling you to make direct payments in the app.',
    apyHeading: 'Earn high yield on your Rand deposits',
    apySubtext: 'Compounded monthly',
    tiles: [
      { title: 'APY_CARD' }, // Sentinel for APY card
      {
        title: 'Anytime',
        line1: 'Access to funds',
        line2: 'Withdraw anytime at no additional cost',
      },
      {
        title: '0%',
        line1: 'Tax on interest earned',
      },
      {
        title: 'Zero',
        line1: 'Fees on payments',
        line2: 'Pay any Gobankless account for free',
      },
    ],
  },
  yield: {
    description: 'A crypto savings wallet that lets you hold value in ETH while still making direct payments in Gobankless.',
    apyHeading: 'Earn high yield on your ETH deposits',
    apySubtext: 'Compounded monthly',
    tiles: [
      { title: 'APY_CARD' },
      {
        title: 'Anytime',
        line1: 'Access to funds',
        line2: 'Swap between ETH and local wallets at no additional cost',
      },
      {
        title: '0%',
        line1: 'Tax on interest earned',
      },
      {
        title: 'Zero',
        line1: 'Fees on payments',
        line2: 'Pay any Gobankless account for free',
      },
    ],
  },
  yieldSurprise: {
    description: 'Your Earnings wallet is where Gobankless deposits the fees you earn from helping customers move cash to and from crypto.',
    apyHeading: 'Turn your shifts into 25% annual yield',
    apySubtext: 'Compounded as your agent earnings grow',
    tiles: [
      { title: 'APY_CARD' },
      {
        title: 'Anytime',
        line1: 'Access to your earnings',
        line2: 'Withdraw to cash or crypto anytime at no additional cost',
      },
      {
        title: '0%',
        line1: 'Account fees on earnings',
      },
      {
        title: 'Zero',
        line1: 'Fees on Gobankless payouts',
        line2: 'Keep 100% of what you earn from your shifts',
      },
    ],
  },
  btc: {
    description: 'A Bitcoin savings wallet that tracks BTC value while earning yield and letting you pay directly in the app.',
    apyHeading: 'Earn high yield on your BTC deposits',
    apySubtext: 'Compounded monthly',
    tiles: [
      { title: 'APY_CARD' },
      {
        title: 'Anytime',
        line1: 'Access to funds',
        line2: 'Withdraw anytime at no additional cost',
      },
      {
        title: '0%',
        line1: 'Tax on interest earned',
      },
      {
        title: 'Zero',
        line1: 'Fees on payments',
        line2: 'Pay any Gobankless account for free',
      },
    ],
  },
  mzn: {
    description: 'A Metical savings wallet that earns strong yield on local cash while enabling instant payments in Mozambique.',
    apyHeading: 'Earn high yield on your Metical deposits',
    apySubtext: 'Compounded monthly',
    tiles: [
      { title: 'APY_CARD' },
      {
        title: 'Anytime',
        line1: 'Access to funds',
        line2: 'Withdraw anytime at no additional cost',
      },
      {
        title: '0%',
        line1: 'Tax on interest earned',
      },
      {
        title: 'Zero',
        line1: 'Fees on payments',
        line2: 'Pay any Gobankless account for free',
      },
    ],
  },
  zwd: {
    description: 'A Zimbabwe dollar savings wallet that earns strong yield on your deposits while enabling instant Gobankless payments.',
    apyHeading: 'Earn high yield on your ZWD deposits',
    apySubtext: 'Compounded monthly',
    tiles: [
      { title: 'APY_CARD' },
      {
        title: 'Anytime',
        line1: 'Access to funds',
        line2: 'Withdraw anytime at no additional cost',
      },
      {
        title: '0%',
        line1: 'Tax on interest earned',
      },
      {
        title: 'Zero',
        line1: 'Fees on payments',
        line2: 'Pay any Gobankless account for free',
      },
    ],
  },
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

  // Get copy for current wallet
  const walletCopy = HELPER_COPY[currentWalletKey] || HELPER_COPY.savings // Fallback to savings if not found
  
  // Get APY from card definitions (single source of truth)
  // Earnings wallet (yieldSurprise) uses ZAR wallet's APY as special case
  const getApyForWallet = (walletKey: WalletKey): number => {
    if (walletKey === 'yieldSurprise') {
      // Earnings wallet always uses ZAR wallet's APY
      const zarCard = getCardDefinition('savings')
      return zarCard.annualYieldBps ? zarCard.annualYieldBps / 100 : 9.38
    }
    
    // For other wallets, use their own APY from card definitions
    // Note: walletKey from CardStack may include 'yieldSurprise', but cardDefinitions only has: 'zwd' | 'savings' | 'yield' | 'mzn' | 'btc'
    const cardDef = getCardDefinition(walletKey as 'zwd' | 'savings' | 'yield' | 'mzn' | 'btc')
    return cardDef.annualYieldBps ? cardDef.annualYieldBps / 100 : 9.38
  }
  
  const apyValue = getApyForWallet(currentWalletKey)
  const apyPercentage = `${apyValue.toFixed(1)}%`

  return (
    <ActionSheet open={!!walletKey} onClose={onClose} title={title} size="tall">
      <div className={styles.content}>
        <div className={styles.tiles}>
          {/* Descriptive paragraph */}
          <p className={styles.description}>
            {walletCopy.description}
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
            <h3 className={styles.apyHeading}>{walletCopy.apyHeading}</h3>
            <p className={styles.apySubtext}>{walletCopy.apySubtext}</p>
          </div>

          {/* Tiles 2-4: Render from copy map (skip index 0 which is APY_CARD sentinel) */}
          {walletCopy.tiles.slice(1).map((tile, index) => (
            <div key={index} className={styles.tile}>
              <h3 className={styles.tileTitle}>{tile.title}</h3>
              {tile.line1 && <p className={styles.tileLine1}>{tile.line1}</p>}
              {tile.line2 && <p className={styles.tileLine2}>{tile.line2}</p>}
            </div>
          ))}
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


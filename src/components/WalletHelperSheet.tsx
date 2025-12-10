'use client'

import { useState, useEffect, useMemo } from 'react'
import Image from 'next/image'
import BaseHelperSheet, { type HelperPage, type PrimaryCtaConfig } from './helpers/BaseHelperSheet'
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

// Render wallet content for a given wallet key
const renderWalletContent = (walletKey: WalletKey) => {
  const walletCopy = HELPER_COPY[walletKey] || HELPER_COPY.savings
  const cardImage = cardImages[walletKey]
  const apyValue = getApyForWallet(walletKey)
  const apyPercentage = `${apyValue.toFixed(1)}%`

  return (
    <div className={styles.tiles}>
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
              alt={walletTitleMap[walletKey]}
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
  )
}

export default function WalletHelperSheet({ walletKey, onClose }: WalletHelperSheetProps) {
  const [sequence, setSequence] = useState<WalletKey[]>([])
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(0)

  // Build circular sequence starting from entry point
  useEffect(() => {
    if (walletKey) {
      const entryIndex = WALLET_SEQUENCE.indexOf(walletKey)
      
      if (entryIndex === -1) {
        // Fallback: if key not found, use first wallet
        setSequence(WALLET_SEQUENCE)
        setCurrentPageIndex(0)
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
      setCurrentPageIndex(0)
    } else {
      setSequence([])
      setCurrentPageIndex(0)
    }
  }, [walletKey])

  // Build pages array from sequence
  const pages = useMemo<HelperPage[]>(() => {
    return sequence.map((walletKey) => ({
      content: renderWalletContent(walletKey),
    }))
  }, [sequence])

  if (sequence.length === 0 || pages.length === 0) return null

  // CTA configuration: Done on last page, Next otherwise
  const primaryCtaForPage = (pageIndex: number, totalPages: number): PrimaryCtaConfig => {
    const isLast = pageIndex === totalPages - 1
    return {
      label: isLast ? 'Done' : 'Next',
      variant: isLast ? 'done' : 'next',
    }
  }

  // Title function: returns title for current page
  const getTitleForPage = (pageIndex: number): string => {
    const walletKey = sequence[pageIndex]
    return walletTitleMap[walletKey] || 'Wallet'
  }

  // Description function: returns description for current page
  const getDescriptionForPage = (pageIndex: number): string => {
    const walletKey = sequence[pageIndex]
    const walletCopy = HELPER_COPY[walletKey] || HELPER_COPY.savings
    return walletCopy.description
  }

  const handlePageChange = (newPageIndex: number) => {
    setCurrentPageIndex(newPageIndex)
  }

  return (
    <BaseHelperSheet
      isOpen={!!walletKey}
      onClose={onClose}
      title={getTitleForPage}
      description={getDescriptionForPage}
      pages={pages}
      currentPage={currentPageIndex}
      className="wallet-helper-sheet"
      primaryCtaForPage={primaryCtaForPage}
      onPageChange={handlePageChange}
    />
  )
}


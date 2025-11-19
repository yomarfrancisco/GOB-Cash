'use client'

import Image from 'next/image'
import ActionSheet from './ActionSheet'
import styles from './WalletHelperSheet.module.css'

type WalletKey = 'savings' | 'pepe' | 'yield' | 'mzn' | 'btc'

type WalletHelperSheetProps = {
  walletKey: WalletKey | null
  onClose: () => void
}

const walletTitleMap: Record<WalletKey, string> = {
  savings: 'ZAR wallet',
  mzn: 'MZN wallet',
  pepe: 'PEPE wallet',
  yield: 'ETH wallet',
  btc: 'BTC wallet',
}

const cardImages: Record<WalletKey, string> = {
  savings: '/assets/cards/card-savings.jpg',
  pepe: '/assets/cards/card-pepe.jpg',
  yield: '/assets/cards/card-ETH.jpg',
  mzn: '/assets/cards/card-MZN.jpg',
  btc: '/assets/cards/card-BTC.jpg',
}

export default function WalletHelperSheet({ walletKey, onClose }: WalletHelperSheetProps) {
  if (!walletKey) return null

  const title = walletTitleMap[walletKey]
  const cardImage = cardImages[walletKey]

  return (
    <ActionSheet open={!!walletKey} onClose={onClose} title={title} size="tall">
      <div className={styles.content}>
        {/* Descriptive paragraph */}
        <p className={styles.description}>
          A savings account that earns interest on your deposits while enabling you to make direct payments on the app
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
          <p className={styles.tileLine2}>Withdraw anytime at no additional cost</p>
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
    </ActionSheet>
  )
}


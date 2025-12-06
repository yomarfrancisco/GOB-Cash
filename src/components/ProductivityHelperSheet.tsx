'use client'

import Image from 'next/image'
import ActionSheet from './ActionSheet'
import styles from './ProductivityHelperSheet.module.css'

type ProductivityHelperSheetProps = {
  isOpen: boolean
  onClose: () => void
}

export default function ProductivityHelperSheet({ isOpen, onClose }: ProductivityHelperSheetProps) {
  return (
    <ActionSheet open={isOpen} onClose={onClose} title="Productivity Score" size="tall">
      <div className={styles.content}>
        {/* Descriptive paragraph */}
        <p className={styles.description}>
          Your Productivity score measures how effectively you turn your time into earnings. It combines three things:
        </p>

        {/* Tile 1: Showing Up */}
        <div className={styles.tile}>
          <div className={styles.imageContainer}>
            <Image
              src="/assets/stopwatch.png"
              alt="Stopwatch"
              width={204}
              height={85}
              className={styles.productivityImage}
              unoptimized
            />
          </div>
          <h3 className={styles.tileTitle}>1. Showing Up</h3>
          <p className={styles.tileLine1}>Checking in on time and consistently.</p>
        </div>

        {/* Tile 2: Moving Volume */}
        <div className={styles.tile}>
          <div className={styles.imageContainer}>
            <Image
              src="/assets/currency.png"
              alt="Currency"
              width={204}
              height={85}
              className={styles.productivityImage}
              unoptimized
            />
          </div>
          <h3 className={styles.tileTitle}>2. Moving Volume</h3>
          <p className={styles.tileLine1}>How much cash-to-crypto or crypto-to-cash activity you complete while you're active.</p>
        </div>

        {/* Tile 3: Working Clean */}
        <div className={styles.tile}>
          <div className={styles.imageContainer}>
            <Image
              src="/assets/hazard.png"
              alt="Hazard"
              width={163}
              height={68}
              className={styles.productivityImage}
              unoptimized
            />
          </div>
          <h3 className={styles.tileTitle}>3. Working Clean</h3>
          <p className={styles.tileLine1}>Low dispute rates, no errors, no reversals.</p>
        </div>
      </div>
    </ActionSheet>
  )
}


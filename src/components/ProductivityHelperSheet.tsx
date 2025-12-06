'use client'

import Image from 'next/image'
import { ChevronRight } from 'lucide-react'
import ActionSheet from './ActionSheet'
import styles from './ProductivityHelperSheet.module.css'

type ProductivityHelperSheetProps = {
  isOpen: boolean
  onClose: () => void
  onNextPage?: () => void
}

export default function ProductivityHelperSheet({ isOpen, onClose, onNextPage }: ProductivityHelperSheetProps) {
  return (
    <ActionSheet open={isOpen} onClose={onClose} title="Productivity Score" size="tall">
      <div className={styles.content}>
        {/* Descriptive paragraph */}
        <p className={styles.description}>
          Your Productivity Score measures how well you use the time you unlock each day to earn on Gobankless.
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
              width={245}
              height={102}
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

        {/* Pagination Footer */}
        <div className={styles.pageParent}>
          <div className={styles.pageLabel}>Page 1 of 3</div>
          <div className={styles.lButtonWrapper}>
            <button className={styles.lButton} onClick={onNextPage} type="button">
              <div className={styles.lButtonContent}>
                <span>Next</span>
                <ChevronRight size={24} strokeWidth={2} className={styles.ico24ArrowsNextUi} />
              </div>
            </button>
          </div>
        </div>
      </div>
    </ActionSheet>
  )
}


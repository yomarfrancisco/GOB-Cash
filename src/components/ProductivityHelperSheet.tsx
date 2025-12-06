'use client'

import { useState, useEffect } from 'react'
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
  const [page, setPage] = useState<1 | 2 | 3>(1)

  // Reset to page 1 when sheet closes
  useEffect(() => {
    if (!isOpen) {
      setPage(1)
    }
  }, [isOpen])

  const handleNext = () => {
    if (page < 3) {
      setPage((prev) => (prev + 1) as 2 | 3)
    }
    // Call external callback if provided
    if (onNextPage) {
      onNextPage()
    }
  }

  return (
    <ActionSheet open={isOpen} onClose={onClose} title="Productivity Score" size="tall">
      <div className={styles.content}>
        {/* Descriptive paragraph - conditional based on page */}
        {page === 1 && (
          <p className={styles.description}>
            Your Productivity Score measures how well you use the time you unlock each day to earn on Gobankless.
          </p>
        )}
        {page === 2 && (
          <p className={styles.description}>
            Your Productivity score directly influences:
          </p>
        )}

        {/* Page 1: Three tiles */}
        {page === 1 && (
          <>
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
          </>
        )}

        {/* Page 2: Three tiles */}
        {page === 2 && (
          <>
            {/* Tile 1: Your earnings */}
            <div className={styles.tile}>
              <div className={styles.imageContainer}>
                <Image
                  src="/assets/coin.png"
                  alt="Coin"
                  width={204}
                  height={85}
                  className={styles.productivityImage}
                  unoptimized
                />
              </div>
              <h3 className={styles.tileTitle}>Your earnings</h3>
              <p className={styles.tileLine1}>Higher productivity → higher daily payouts + higher commissions.</p>
            </div>

            {/* Tile 2: Your cash multiple */}
            <div className={styles.tile}>
              <div className={styles.imageContainer}>
                <Image
                  src="/assets/coinMultiple.png"
                  alt="Coin Multiple"
                  width={204}
                  height={85}
                  className={styles.productivityImage}
                  unoptimized
                />
              </div>
              <h3 className={styles.tileTitle}>Your cash multiple</h3>
              <p className={styles.tileLine1}>A higher score increases the "Cash x…" available on your Agent Earnings card.</p>
            </div>

            {/* Tile 3: Your priority */}
            <div className={styles.tile}>
              <div className={styles.imageContainer}>
                <Image
                  src="/assets/hourglass.png"
                  alt="Hourglass"
                  width={204}
                  height={85}
                  className={styles.productivityImage}
                  unoptimized
                />
              </div>
              <h3 className={styles.tileTitle}>Your priority</h3>
              <p className={styles.tileLine1}>High-Productivity agents are matched first when customers request service.</p>
            </div>
          </>
        )}

        {/* Pagination Footer */}
        <div className={styles.pageParent}>
          <div className={styles.pageLabel}>
            {page === 1 && 'Page 1 of 3'}
            {page === 2 && 'Page 2 of 3'}
            {page === 3 && 'Page 3 of 3'}
          </div>
          <div className={styles.lButtonWrapper}>
            <button className={styles.lButton} onClick={handleNext} type="button">
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


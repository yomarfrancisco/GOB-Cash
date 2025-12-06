'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { ChevronRight, ChevronLeft } from 'lucide-react'
import ActionSheet from './ActionSheet'
import styles from './ProductivityHelperSheet.module.css'

type ProductivityHelperSheetProps = {
  isOpen: boolean
  onClose: () => void
  onNextPage?: () => void
}

export default function ProductivityHelperSheet({ isOpen, onClose, onNextPage }: ProductivityHelperSheetProps) {
  const [page, setPage] = useState<1 | 2 | 3 | 4>(1)

  // Reset to page 1 when sheet closes
  useEffect(() => {
    if (!isOpen) {
      setPage(1)
    }
  }, [isOpen])

  const handleNext = () => {
    if (page < 4) {
      setPage((prev) => (prev + 1) as 2 | 3 | 4)
    }
    // Call external callback if provided
    if (onNextPage) {
      onNextPage()
    }
  }

  const handlePrevPage = () => {
    setPage((p) => {
      const newPage = p - 1
      return (newPage >= 1 ? newPage : 1) as 1 | 2 | 3 | 4
    })
  }

  return (
    <ActionSheet open={isOpen} onClose={onClose} title="" size="tall">
      <div className={styles.bodyRoot}>
        {/* Header row with back button and title */}
        <div className={styles.headerRow}>
          {page > 1 && (
            <button
              type="button"
              className={styles.backButton}
              onClick={handlePrevPage}
            >
              <ChevronLeft size={20} />
            </button>
          )}
          <h2 className={styles.title}>Productivity Score</h2>
        </div>
        
        <div className={styles.content}>

        {/* Descriptive paragraph - conditional based on page */}
        {page === 1 && (
          <p className={styles.description}>
            Your Productivity score measures <strong>how well you use the time you unlock each day to make money</strong> on Gobankless. It combines three things:
          </p>
        )}
        {page === 2 && (
          <p className={styles.description}>
            Your Productivity score directly influences:
          </p>
        )}
        {page === 3 && (
          <p className={styles.description}>
            Here's how to increase your score:
          </p>
        )}
        {page === 4 && (
          <p className={styles.description}>
            A simple way to think about it. Productivity = how much value you create per hour unlocked.
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
              <p className={styles.tileLine1}>How much <strong>cash-to-crypto</strong> or <strong>crypto-to-cash</strong> activity you complete while you're active.</p>
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
              <h3 className={styles.tileTitle}>1. Your earnings</h3>
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
              <h3 className={styles.tileTitle}>2. Your cash multiple</h3>
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
              <h3 className={styles.tileTitle}>3. Your priority</h3>
              <p className={styles.tileLine1}>High-Productivity agents are matched first when customers request service.</p>
            </div>
          </>
        )}

        {/* Page 3: Three tiles */}
        {page === 3 && (
          <>
            {/* Tile 1: Check in daily */}
            <div className={styles.tile}>
              <div className={styles.imageContainer}>
                <Image
                  src="/assets/mobile.png"
                  alt="Mobile"
                  width={204}
                  height={85}
                  className={styles.productivityImage}
                  unoptimized
                />
              </div>
              <h3 className={styles.tileTitle}>1. Check in daily</h3>
              <p className={styles.tileLine1}>Each shift is <strong>3 hours</strong>. Reliable presence increases your baseline score.</p>
            </div>

            {/* Tile 2: Complete more transactions */}
            <div className={styles.tile}>
              <div className={styles.imageContainer}>
                <Image
                  src="/assets/truck cash.png"
                  alt="Truck Cash"
                  width={204}
                  height={85}
                  className={styles.productivityImage}
                  unoptimized
                />
              </div>
              <h3 className={styles.tileTitle}>2. Complete more transactions</h3>
              <p className={styles.tileLine1}>The more real activity you process, the faster your score grows.</p>
            </div>

            {/* Tile 3: Keep a clean record */}
            <div className={styles.tile}>
              <div className={styles.imageContainer}>
                <Image
                  src="/assets/police.png"
                  alt="Police"
                  width={204}
                  height={85}
                  className={styles.productivityImage}
                  unoptimized
                />
              </div>
              <h3 className={styles.tileTitle}>3. Keep a clean record</h3>
              <p className={styles.tileLine1}>Low dispute rate = stronger Productivity.</p>
            </div>
          </>
        )}

        {/* Page 4: Three tiles */}
        {page === 4 && (
          <>
            {/* Tile 1: More value */}
            <div className={styles.tile}>
              <div className={styles.imageContainer}>
                <Image
                  src="/assets/americas.png"
                  alt="Americas"
                  width={204}
                  height={85}
                  className={styles.productivityImage}
                  unoptimized
                />
              </div>
              <h3 className={styles.tileTitle}>More value <strong>=</strong></h3>
            </div>

            {/* Tile 2: More earnings */}
            <div className={styles.tile}>
              <div className={styles.imageContainer}>
                <Image
                  src="/assets/launch.png"
                  alt="Launch"
                  width={204}
                  height={85}
                  className={styles.productivityImage}
                  unoptimized
                />
              </div>
              <h3 className={styles.tileTitle}>More earnings <strong>=</strong></h3>
            </div>

            {/* Tile 3: more cash available */}
            <div className={styles.tile}>
              <div className={styles.imageContainer}>
                <Image
                  src="/assets/lock.png"
                  alt="Lock"
                  width={204}
                  height={85}
                  className={styles.productivityImage}
                  unoptimized
                />
              </div>
              <h3 className={styles.tileTitle}>More cash available to you in the app.</h3>
            </div>
          </>
        )}

        {/* Pagination Footer - Fixed at bottom with gradient fade */}
        <div className={styles.pageFooter}>
          <div className={styles.pageParent}>
            <div className={styles.pageLabel}>
              {page === 1 && 'Page 1 of 4'}
              {page === 2 && 'Page 2 of 4'}
              {page === 3 && 'Page 3 of 4'}
              {page === 4 && 'Page 4 of 4'}
            </div>
            <div className={styles.lButtonWrapper}>
              <button className={styles.lButton} onClick={handleNext} type="button">
                <div className={styles.lButtonContent}>
                  <span className={styles.lBold}>Next</span>
                  <ChevronRight size={24} strokeWidth={2} className={styles.ico24ArrowsNextUi} />
                </div>
              </button>
            </div>
          </div>
        </div>
        </div>
      </div>
    </ActionSheet>
  )
}


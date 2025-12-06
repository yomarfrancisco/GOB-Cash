'use client'

import { useState, useEffect, useMemo } from 'react'
import Image from 'next/image'
import BaseHelperSheet, { type HelperPage } from './helpers/BaseHelperSheet'
import styles from './ProductivityHelperSheet.module.css'

type ProductivityHelperSheetProps = {
  isOpen: boolean
  onClose: () => void
  onNextPage?: () => void
}

export default function ProductivityHelperSheet({ isOpen, onClose, onNextPage }: ProductivityHelperSheetProps) {
  const [page, setPage] = useState(0) // 0-indexed for BaseHelperSheet

  // Reset to page 0 when sheet closes
  useEffect(() => {
    if (!isOpen) {
      setPage(0)
    }
  }, [isOpen])

  const handlePageChange = (newPage: number) => {
    setPage(newPage)
    // Call external callback if provided
    if (onNextPage) {
      onNextPage()
    }
  }

  // Build pages array
  const pages: HelperPage[] = useMemo(() => {
    const page1: HelperPage = {
      content: (
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
      ),
    }

    const page2: HelperPage = {
      content: (
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
      ),
    }

    const page3: HelperPage = {
      content: (
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
      ),
    }

    const page4: HelperPage = {
      content: (
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
            <h3 className={styles.tileTitle}>
              More value
              <br />
              <strong>=</strong>
            </h3>
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
            <h3 className={styles.tileTitle}>
              More earnings
              <br />
              <strong>=</strong>
            </h3>
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
      ),
    }

    return [page1, page2, page3, page4]
  }, [])

  // Description per page (as ReactNode to support <strong> tags)
  const getDescription = (pageIndex: number) => {
    switch (pageIndex) {
      case 0:
        return (
          <>
            Your Productivity score measures <strong>how well you use the time you unlock each day to make money</strong> on Gobankless. It combines three things:
          </>
        )
      case 1:
        return 'Your Productivity score directly influences:'
      case 2:
        return "Here's how to increase your score:"
      case 3:
        return 'A simple way to think about it. Productivity = how much value you create per hour unlocked.'
      default:
        return ''
    }
  }

  return (
    <BaseHelperSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Productivity Score"
      description={(pageIndex) => getDescription(pageIndex)}
      pages={pages}
      currentPage={page}
      onPageChange={handlePageChange}
      className="productivity-helper-sheet"
      showBackButton={(pageIndex) => pageIndex > 0}
      showPageLabel={true}
      pageLabelFormatter={(pageIndex, totalPages) => `Page ${pageIndex + 1} of ${totalPages}`}
    />
  )
}

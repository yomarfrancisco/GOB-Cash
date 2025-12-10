'use client'

import Image from 'next/image'
import { MessageSquare, Helicopter } from 'lucide-react'
import BaseHelperSheet, { type HelperPage } from './helpers/BaseHelperSheet'
import styles from './MapHelperSheet.module.css'

type MapHelperSheetProps = {
  isOpen: boolean
  onClose: () => void
}

export default function MapHelperSheet({ isOpen, onClose }: MapHelperSheetProps) {
  const page: HelperPage = {
    content: (
      <>
        {/* Tile 1: Map Preview */}
        <div className={styles.tile}>
          <div className={styles.mapPreview}>
            <Image
              src="/assets/map2.png"
              alt="Map preview"
              fill
              className={styles.mapImage}
              sizes="100%"
              priority
              unoptimized
            />
          </div>
          <h3 className={styles.mapTitle}>Discover dealers around you</h3>
          <p className={styles.mapSubtext}>Use the map to see who is near you</p>
        </div>

        {/* Tile 2: Verified Dealer */}
        <div className={styles.tile}>
          <div className={styles.verifiedMarker}>
            <div className={styles.markerBackground}>
              <Image
                src="/assets/Union.svg"
                alt="Location marker"
                fill
                className={styles.markerImage}
                sizes="56px"
                unoptimized
              />
            </div>
            <div className={styles.avatarWrapper}>
              <Image
                src="/assets/avatar_agent5.png"
                alt="Verified dealer"
                fill
                className={styles.avatarImage}
                sizes="40px"
                unoptimized
              />
            </div>
            <div className={styles.verifiedBadgeWrapper}>
              <Image
                src="/assets/verified.svg"
                alt="Verified"
                fill
                className={styles.verifiedBadge}
                sizes="14px"
                unoptimized
              />
            </div>
          </div>
          <h3 className={styles.verifiedDealerTitle}>Connect with verified dealers</h3>
          <p className={styles.verifiedDealerLine1}>
            Tap on verified avatars to visit their profile and send a direct message
          </p>
        </div>

        {/* Tile 3: Community Chat */}
        <div className={styles.tile}>
          <div className={styles.iconContainer}>
            <MessageSquare size={30} strokeWidth={2} className={styles.icon} />
          </div>
          <h3 className={styles.tileTitle}>Agree on logistics</h3>
          <p className={styles.tileLine1}>
            Confirm time and place for cash collection before requesting
          </p>
        </div>

        {/* Tile 4: Courier Services */}
        <div className={styles.tile}>
          <div className={styles.iconContainer}>
            <Helicopter size={30} strokeWidth={2} className={styles.icon} />
          </div>
          <h3 className={styles.tileTitle}>Request cash courier services</h3>
          <p className={styles.tileLine1}>
            Get someone to collect cash and deposit into your account, or withdraw and deliver cash for you anywhere
          </p>
        </div>
      </>
    ),
  }

  return (
    <BaseHelperSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Send cash anywhere"
      subtitle="Find dealers to collect and deliver cash anywhere in the world."
      showDivider={true}
      pages={[page]}
      currentPage={0}
      className="map-helper-sheet"
      showFooter={false}
    />
  )
}

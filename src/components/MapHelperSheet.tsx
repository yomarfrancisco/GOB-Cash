'use client'

import Image from 'next/image'
import ActionSheet from './ActionSheet'
import { MessageSquare, Package, Plane, Helicopter } from 'lucide-react'
import styles from './MapHelperSheet.module.css'

type MapHelperSheetProps = {
  isOpen: boolean
  onClose: () => void
}

export default function MapHelperSheet({ isOpen, onClose }: MapHelperSheetProps) {
  return (
    <ActionSheet open={isOpen} onClose={onClose} title="Send cash anywhere" size="tall">
      <div className={styles.content}>
        {/* Subtitle */}
        <p className={styles.subtitle}>
          Find dealers to collect and deliver cash anywhere in the world.
        </p>
        
        {/* Divider */}
        <div className={styles.divider} />

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
          <h3 className={styles.tileTitle}>Discover dealers around you</h3>
          <p className={styles.tileLine1}>Use the map to see who is near you</p>
        </div>

        {/* Tile 2: Verified Dealer */}
        <div className={styles.tile}>
          <div className={styles.avatarContainer}>
            <Image
              src="/assets/avatar_agent5.png"
              alt="Verified dealer"
              width={64}
              height={64}
              className={styles.dealerAvatar}
              unoptimized
            />
          </div>
          <h3 className={styles.tileTitle}>Connect with verified dealers</h3>
          <p className={styles.tileLine1}>
            Tap on verified avatars to visit their profile and send a direct message
          </p>
        </div>

        {/* Tile 3: Community Chat */}
        <div className={styles.tile}>
          <div className={styles.iconContainer}>
            <MessageSquare size={32} strokeWidth={2} className={styles.icon} />
          </div>
          <h3 className={styles.tileTitle}>Say hi to the community</h3>
          <p className={styles.tileLine1}>
            Introduce yourself with your name, city, and your competitive advantage as a dealer
          </p>
        </div>

        {/* Tile 4: Courier Services */}
        <div className={styles.tile}>
          <div className={styles.iconContainer}>
            <Helicopter size={32} strokeWidth={2} className={styles.icon} />
          </div>
          <h3 className={styles.tileTitle}>Request cash courier services</h3>
          <p className={styles.tileLine1}>
            Get someone to collect cash and deposit into your account, or withdraw and deliver cash for you anywhere
          </p>
        </div>
      </div>
    </ActionSheet>
  )
}


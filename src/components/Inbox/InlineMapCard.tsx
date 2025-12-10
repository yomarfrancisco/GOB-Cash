'use client'

import { useState } from 'react'
import Image from 'next/image'
import styles from './InlineMapCard.module.css'

type InlineMapCardProps = {
  state: 'IDLE' | 'MATCHED_EN_ROUTE' | 'ARRIVED' | 'IN_TRANSIT_TO_HQ' | 'COMPLETED' | 'EXPIRED'
  onMapClick: () => void
}

export default function InlineMapCard({ state, onMapClick }: InlineMapCardProps) {
  const [imageError, setImageError] = useState(false)

  // For v1, use a static map image
  // In future, this could be a live Mapbox component
  const mapImageSrc = '/assets/map2.png' // Using existing map asset

  return (
    <div className={styles.inlineMapCard} onClick={onMapClick}>
      <div className={styles.mapImageContainer}>
        {!imageError ? (
          <Image
            src={mapImageSrc}
            alt="Agent location map"
            fill
            className={styles.mapImage}
            onError={() => setImageError(true)}
            unoptimized
          />
        ) : (
          <div className={styles.mapFallback}>
            <span>Map</span>
          </div>
        )}
        {/* Overlay markers for visual indication */}
        <div className={styles.mapOverlay}>
          <div className={styles.userMarker} />
          <div className={styles.agentMarker} />
        </div>
      </div>
      <div className={styles.mapInfo}>
        <div className={styles.mapInfoRow}>
          <span className={styles.mapInfoLabel}>Distance:</span>
          <span className={styles.mapInfoValue}>7.8 km</span>
        </div>
        <div className={styles.mapInfoRow}>
          <span className={styles.mapInfoLabel}>ETA:</span>
          <span className={styles.mapInfoValue}>20 min</span>
        </div>
        <div className={styles.mapInfoHint}>Tap to view full map</div>
      </div>
    </div>
  )
}


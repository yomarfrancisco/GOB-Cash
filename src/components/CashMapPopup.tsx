'use client'

import { useState } from 'react'
import Image from 'next/image'
import ActionSheet from './ActionSheet'
import MapboxMap, { type Marker } from './MapboxMap'
import AgentSummaryRow from './AgentSummaryRow'
import styles from './CashMapPopup.module.css'

type CashMapPopupProps = {
  open: boolean
  onClose: () => void
  amount: number
  showAgentCard?: boolean
}

// Single $kerryy agent data - matches AgentListSheet format
const KERRYY_AGENT = {
  id: 'kerryy',
  username: '$kerryy',
  avatar: '/assets/avatar_agent5.png',
  insured: 'R49k',
  rating: 4.1,
  reviewCount: 1322,
  progress: 98,
}

export default function CashMapPopup({ open, onClose, amount, showAgentCard = false }: CashMapPopupProps) {
  const [mapContainerId] = useState(() => `cash-map-popup-${Date.now()}`)
  
  // Agent marker for map (same as homepage would show)
  const agentMarker: Marker = {
    id: 'agent-on-way',
    lng: 28.0567, // Sandton-ish
    lat: -26.1069,
    kind: 'member',
    label: '$kerryy',
    avatar: '/assets/avatar_agent5.png',
    name: '$kerryy',
  }

  const handleWhatsAppClick = () => {
    if (typeof window === 'undefined') return
    window.open('https://wa.me/27823306256', '_blank')
  }

  return (
    <ActionSheet open={open} onClose={onClose} title="" size="tall" className={styles.cashMapPopup}>
      <div className={styles.agentPopupRoot}>
        {/* Map container - fills entire popup */}
        <div className={styles.agentPopupMap}>
          <div className={styles.mapContainer} id={mapContainerId} />
          <MapboxMap
            containerId={mapContainerId}
            markers={[agentMarker]}
            styleUrl="mapbox://styles/mapbox/navigation-night-v1"
          />
          {/* Paper/fold overlays - same as homepage, positioned over map */}
          <div className={styles.foldOverlays}>
            <Image
              src="/assets/fold1.png"
              alt=""
              fill
              className={styles.fold1}
              priority
            />
            <Image
              src="/assets/fold2.png"
              alt=""
              fill
              className={styles.fold2}
              priority
            />
          </div>
        </div>

        {/* Overlay - contains close button and card */}
        <div className={styles.agentPopupOverlay}>
          {/* Top bar with distance, ETA, and close button */}
          <div className={styles.mapTopBar}>
            <div className={styles.kmPill}>
              <div className={styles.kmValue}>
                <span className={styles.kmNumber}>7.8</span>
                <span className={styles.kmUnit}>km</span>
              </div>
            </div>
            <div className={styles.etaPill}>
              <span className={styles.etaLabel}>Arriving in</span>
              <span className={styles.etaTime}>20 min</span>
            </div>
            <button className={styles.cashMapClose} onClick={onClose} aria-label="Close">
              <Image src="/assets/clear.svg" alt="" width={18} height={18} />
            </button>
          </div>

          {/* Footer content - bottom region with single $kerryy row */}
          {showAgentCard && (
            <div className={styles.mapSheetOuter}>
              <div className={styles.mapSheetInner}>
                {/* Title section */}
                <div className={styles.titleSection}>
                  <h2 className={styles.sheetTitle}>A dealer is coming to meet you</h2>
                </div>
                
                {/* Agent summary section */}
                <div className={styles.agentSection}>
                  <button
                    className={styles.agentRowButton}
                    onClick={handleWhatsAppClick}
                    type="button"
                  >
                    <AgentSummaryRow agent={KERRYY_AGENT} showWhatsappIcon={true} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </ActionSheet>
  )
}


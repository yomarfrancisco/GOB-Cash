'use client'

import { useState } from 'react'
import Image from 'next/image'
import ActionSheet from './ActionSheet'
import MapboxMap, { type Marker } from './MapboxMap'
import styles from './CashMapPopup.module.css'

type CashMapPopupProps = {
  open: boolean
  onClose: () => void
  amount: number
}

// Agent marker for map (same as homepage would show)
const agentMarker: Marker = {
  id: 'agent-on-way',
  lng: 28.0567, // Sandton-ish
  lat: -26.1069,
  kind: 'member',
  label: '$kerry',
  avatar: '/assets/avatar - profile (1).png',
  name: '$kerry',
}

export default function CashMapPopup({ open, onClose, amount }: CashMapPopupProps) {
  const [mapContainerId] = useState(() => `cash-map-popup-${Date.now()}`)

  const formatAmount = (amount: number) => {
    return `R${amount.toLocaleString('en-ZA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  }

  return (
    <ActionSheet open={open} onClose={onClose} title="" size="tall" className={styles.cashMapPopup}>
      <div className={styles.cashMapPopupHeader}>
        <button className={styles.popupClose} onClick={onClose} aria-label="Close">
          <Image src="/assets/clear.svg" alt="" width={18} height={18} />
        </button>
        <div className={styles.popupTitle}>
          Convert {formatAmount(amount)} cash to crypto
        </div>
        <div style={{ width: '18px' }} /> {/* Spacer for center alignment */}
      </div>
      <div className={styles.cashMapPopupMap}>
        <div className={styles.mapCard}>
          {/* Map container - Mapbox will attach here */}
          <div className={styles.mapInnerContainer} id={mapContainerId} />
          <MapboxMap
            containerId={mapContainerId}
            markers={[agentMarker]}
            styleUrl="mapbox://styles/mapbox/streets-v12"
          />
          {/* Paper/fold overlays - same as homepage */}
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
    </ActionSheet>
  )
}


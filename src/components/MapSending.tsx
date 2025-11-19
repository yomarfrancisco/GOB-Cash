'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import MapboxMap, { type Marker } from './MapboxMap'
import ActionSheet from './ActionSheet'
import styles from './MapSending.module.css'

type MapSendingProps = {
  open: boolean
  onClose: () => void
  amount: number
  agentHandle: string
  mode?: 'convert' | 'send' // 'convert' for cash-to-crypto, 'send' for cash delivery
}

// Agent data lookup
const AGENT_DATA: Record<string, { avatar: string; name: string; rating: number; distance: string; time: string }> = {
  '$kerry': {
    avatar: '/assets/avatar - profile (1).png',
    name: '$kerry',
    rating: 4.8,
    distance: '8 km away',
    time: '20 min',
  },
  '$simi_love': {
    avatar: '/assets/avatar - profile (2).png',
    name: '$simi_love',
    rating: 4.9,
    distance: '5 km away',
    time: '15 min',
  },
  '$ariel': {
    avatar: '/assets/avatar - profile (3).png',
    name: '$ariel',
    rating: 4.7,
    distance: '12 km away',
    time: '25 min',
  },
  '$dana': {
    avatar: '/assets/avatar - profile (4).png',
    name: '$dana',
    rating: 4.6,
    distance: '10 km away',
    time: '22 min',
  },
}

const DEFAULT_AGENT = AGENT_DATA['$kerry']

export default function MapSending({ open, onClose, amount, agentHandle, mode = 'convert' }: MapSendingProps) {
  const [mapContainerId] = useState(() => `map-sending-${Date.now()}`)
  const agent = AGENT_DATA[agentHandle] || DEFAULT_AGENT

  const formatAmount = (amount: number) => {
    return `R${amount.toLocaleString('en-ZA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  }

  // Agent marker for map
  const agentMarker: Marker = {
    id: 'agent-on-way',
    lng: 28.0567, // Sandton-ish
    lat: -26.1069,
    kind: 'member',
    label: agent.name,
    avatar: agent.avatar,
    name: agent.name,
  }

  const handleAcceptRequest = () => {
    console.log('Accept request clicked', { amount, agentHandle, mode })
    // TODO: implement accept request flow
    onClose()
  }

  if (!open) return null

  const headerTitle = mode === 'convert' 
    ? `Convert ${formatAmount(amount)} cash to crypto`
    : `Deliver ${formatAmount(amount)} cash`

  return (
    <div className={styles.mapSendingOverlay}>
      <div className={styles.mapSendingContainer}>
        {/* Map background */}
        <div className={styles.mapBackground}>
          <div className={styles.mapContainer} id={mapContainerId} />
          <MapboxMap
            containerId={mapContainerId}
            markers={[agentMarker]}
            styleUrl="mapbox://styles/mapbox/streets-v12"
          />
        </div>

        {/* Header */}
        <div className={styles.mapSendingHeader}>
          <button className={styles.closeButton} onClick={onClose} aria-label="Close">
            <Image src="/assets/clear.svg" alt="" width={18} height={18} />
          </button>
          <h2 className={styles.headerTitle}>{headerTitle}</h2>
          <div style={{ width: '18px' }} /> {/* Spacer for center alignment */}
        </div>

        {/* Bottom sheet */}
        <ActionSheet open={true} onClose={onClose} title="" size="tall" className={styles.bottomSheet}>
          <div className={styles.bottomSheetContent}>
            <div className={styles.agentInfo}>
              <div className={styles.agentAvatar}>
                <Image
                  src={agent.avatar}
                  alt={agent.name}
                  width={60}
                  height={60}
                  className={styles.agentAvatarImage}
                  unoptimized
                />
              </div>
              <div className={styles.agentDetails}>
                <div className={styles.agentName}>{agent.name}</div>
                <div className={styles.agentMeta}>
                  <span className={styles.agentRating}>⭐ {agent.rating}</span>
                  <span className={styles.agentDistance}>{agent.distance} · {agent.time}</span>
                </div>
              </div>
            </div>

            <div className={styles.amountInfo}>
              <div className={styles.amountLabel}>Amount</div>
              <div className={styles.amountValue}>{formatAmount(amount)}</div>
            </div>

            <div className={styles.addressInfo}>
              <div className={styles.addressLabel}>Meeting location</div>
              <div className={styles.addressValue}>123 Sandton Drive, Sandton, 2196</div>
            </div>

            <div className={styles.insuranceBar}>
              <div className={styles.insuranceLabel}>Insured up to R50,000</div>
            </div>

            <button className={styles.acceptButton} onClick={handleAcceptRequest} type="button">
              Accept request
            </button>
            </div>
          </ActionSheet>
        </div>
      </div>
    </div>
  )
}


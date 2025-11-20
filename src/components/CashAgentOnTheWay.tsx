'use client'

import { useState } from 'react'
import Image from 'next/image'
import MapboxMap, { type Marker } from './MapboxMap'
import styles from './CashAgentOnTheWay.module.css'

type CashAgentOnTheWayProps = {
  amount: number
  agentHandle: string
  onClose: () => void
}

// Agent data lookup
const AGENT_DATA: Record<string, { avatar: string; name: string; rating: number; distance: string; time: string; reviews: number }> = {
  '$kerry': {
    avatar: '/assets/avatar - profile (1).png',
    name: '$kerry',
    rating: 4.8,
    distance: '8 km away',
    time: '20 min',
    reviews: 1322,
  },
  '$simi_love': {
    avatar: '/assets/avatar - profile (2).png',
    name: '$simi_love',
    rating: 4.9,
    distance: '5 km away',
    time: '15 min',
    reviews: 13,
  },
  '$ariel': {
    avatar: '/assets/avatar - profile (3).png',
    name: '$ariel',
    rating: 4.7,
    distance: '12 km away',
    time: '25 min',
    reviews: 3,
  },
  '$dana': {
    avatar: '/assets/avatar - profile (4).png',
    name: '$dana',
    rating: 4.6,
    distance: '10 km away',
    time: '22 min',
    reviews: 56,
  },
}

const DEFAULT_AGENT = AGENT_DATA['$kerry']

export default function CashAgentOnTheWay({ amount, agentHandle, onClose }: CashAgentOnTheWayProps) {
  const [mapContainerId] = useState(() => `cash-agent-map-${Date.now()}`)
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
    console.log('Accept request clicked', { amount, agentHandle })
    // TODO: implement accept request flow
    onClose()
  }

  return (
    <>
      {/* Map bottom sheet - tall popup */}
      <div className={styles.mapSheet}>
        <div className={styles.mapSheetHeader}>
          <button className={styles.closeButton} onClick={onClose} aria-label="Close">
            <Image src="/assets/clear.svg" alt="" width={18} height={18} />
          </button>
          <h2 className={styles.mapSheetTitle}>Convert {formatAmount(amount)} cash to crypto</h2>
          <div style={{ width: '18px' }} /> {/* Spacer for center alignment */}
        </div>
        <div className={styles.mapCard}>
          {/* Map container */}
          <div className={styles.mapInnerContainer} id={mapContainerId} />
          <MapboxMap
            containerId={mapContainerId}
            markers={[agentMarker]}
            styleUrl="mapbox://styles/mapbox/streets-v12"
          />
          {/* Fold overlays - same as homepage */}
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

      {/* Agent details sheet - on top of map */}
      <div className={styles.agentSheet}>
        <div className={styles.agentSheetContent}>
          {/* Title row */}
          <div className={styles.titleRow}>
            <h3 className={styles.deliverTitle}>Deliver {formatAmount(amount)} cash</h3>
            <div className={styles.distanceTime}>{agent.distance} · {agent.time}</div>
          </div>

          {/* Agent identity */}
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
              <div className={styles.agentRatingRow}>
                <span className={styles.ratingValue}>{agent.rating}</span>
                <span className={styles.starIcon}>⭐</span>
                <span className={styles.reviewCount}>({agent.reviews.toLocaleString()})</span>
              </div>
              <div className={styles.insuranceBar}>
                <div className={styles.insuranceLabel}>Deposit insurance</div>
                <div className={styles.insuranceAmount}>R50,000</div>
              </div>
            </div>
          </div>

          {/* Meeting location */}
          <div className={styles.meetingLocation}>
            <div className={styles.locationLabel}>Meeting location</div>
            <div className={styles.locationAddress}>123 Sandton Drive, Sandton, 2196</div>
          </div>

          {/* Accept request button */}
          <button className={styles.acceptButton} onClick={handleAcceptRequest} type="button">
            Accept request
          </button>
        </div>
      </div>
    </>
  )
}


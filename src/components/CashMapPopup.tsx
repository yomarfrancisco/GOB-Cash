'use client'

import { useState } from 'react'
import Image from 'next/image'
import ActionSheet from './ActionSheet'
import MapboxMap, { type Marker } from './MapboxMap'
import CashAgentDetailSheet from './CashAgentDetailSheet'
import styles from './CashMapPopup.module.css'

type CashMapPopupProps = {
  open: boolean
  onClose: () => void
  amount: number
  showAgentCard?: boolean
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

// Agent data lookup
const AGENT_DATA: Record<string, { avatar: string; name: string; rating: number; distance: string; time: string; address: string; insured: string }> = {
  '$kerry': {
    avatar: '/assets/avatar - profile (1).png',
    name: '$kerry',
    rating: 4.8,
    distance: '8',
    time: '20',
    address: '123 Sandton Drive, Sandton, 2196',
    insured: 'R50,000',
  },
  '$simi_love': {
    avatar: '/assets/avatar - profile (2).png',
    name: '$simi_love',
    rating: 4.9,
    distance: '5',
    time: '15',
    address: '123 Sandton Drive, Sandton, 2196',
    insured: 'R50,000',
  },
  '$ariel': {
    avatar: '/assets/avatar - profile (3).png',
    name: '$ariel',
    rating: 4.7,
    distance: '12',
    time: '25',
    address: '123 Sandton Drive, Sandton, 2196',
    insured: 'R50,000',
  },
  '$dana': {
    avatar: '/assets/avatar - profile (4).png',
    name: '$dana',
    rating: 4.6,
    distance: '10',
    time: '22',
    address: '123 Sandton Drive, Sandton, 2196',
    insured: 'R50,000',
  },
}

const DEFAULT_AGENT = AGENT_DATA['$kerry']

export default function CashMapPopup({ open, onClose, amount, showAgentCard = false }: CashMapPopupProps) {
  const [mapContainerId] = useState(() => `cash-map-popup-${Date.now()}`)
  
  // Use default agent for now - convert to AgentSummaryRow format
  const agentData = DEFAULT_AGENT
  const agentForRow = {
    id: 'kerry',
    username: agentData.name,
    avatar: agentData.avatar,
    insured: agentData.insured,
    rating: 4.8, // Default rating
    reviewCount: 1322, // Default review count
    progress: 98, // Default progress
    address: agentData.address,
  }

  // Agent marker for map (same as homepage would show)
  const agentMarker: Marker = {
    id: 'agent-on-way',
    lng: 28.0567, // Sandton-ish
    lat: -26.1069,
    kind: 'member',
    label: agentData.name,
    avatar: agentData.avatar,
    name: agentData.name,
  }

  const formatAmount = (amount: number) => {
    return `R${amount.toLocaleString('en-ZA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  }

  const handleAcceptAgent = () => {
    console.log('Accept agent clicked', { amount, agent: agentForRow })
    // TODO: implement accept agent flow
    onClose()
  }

  const handleCancelRequest = () => {
    console.log('Cancel request clicked')
    // TODO: implement cancel request flow
    onClose()
  }

  return (
    <ActionSheet open={open} onClose={onClose} title="" size="tall" className={styles.cashMapPopup}>
      <div className={styles.cashMapPopupInner}>
        {/* Floating close button */}
        <button className={styles.cashMapClose} onClick={onClose} aria-label="Close">
          <Image src="/assets/clear.svg" alt="" width={18} height={18} />
        </button>
        {/* Map container - direct container for Mapbox */}
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

        {/* Agent details sheet - nested popup on top of map */}
        {showAgentCard && (
          <CashAgentDetailSheet
            agent={agentForRow}
            onAccept={handleAcceptAgent}
            onCancel={handleCancelRequest}
          />
        )}
      </div>
    </ActionSheet>
  )
}


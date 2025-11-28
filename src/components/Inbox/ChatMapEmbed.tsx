'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import Image from 'next/image'
import MapboxMap, { type Marker } from '../MapboxMap'
import { useCashFlowStateStore } from '@/state/cashFlowState'
import { useFinancialInboxStore } from '@/state/financialInbox'
import styles from './ChatMapEmbed.module.css'

type ChatMapEmbedProps = {
  onMapClick: () => void
}

export default function ChatMapEmbed({ onMapClick }: ChatMapEmbedProps) {
  const [mapContainerId] = useState(() => `chat-map-embed-${Date.now()}`)
  const [mapReady, setMapReady] = useState(false)
  const { cashFlowState } = useCashFlowStateStore()
  const { cashDepositScenario, cashWithdrawalScenario } = useFinancialInboxStore()
  const isWithdrawal = !!cashWithdrawalScenario
  
  // Same coordinates as CashMapPopup
  const HQ_COORD = useMemo(
    () => ({
      lng: 28.0560,
      lat: -26.1070,
    }),
    []
  )

  const userLocation = useMemo(
    () => ({
      lng: 28.0483,
      lat: -26.1075,
    }),
    []
  )

  // For chat embed, agent starts at different location based on scenario
  const agentLocation = useMemo(
    () => {
      if (isWithdrawal) {
        return {
          lng: 28.0520, // Different starting point for withdrawal
          lat: -26.1050,
        }
      }
      return {
        lng: HQ_COORD.lng,
        lat: HQ_COORD.lat,
      }
    },
    [HQ_COORD.lng, HQ_COORD.lat, isWithdrawal]
  )

  // User marker
  const userMarker: Marker = useMemo(
    () => ({
      id: 'user-location',
      lng: userLocation.lng,
      lat: userLocation.lat,
      kind: 'member' as const,
      label: 'You',
      name: 'You',
    }),
    [userLocation.lng, userLocation.lat]
  )

  // Agent marker
  const agentMarker: Marker = useMemo(
    () => ({
      id: 'agent-on-way',
      lng: agentLocation.lng,
      lat: agentLocation.lat,
      kind: 'dealer' as const,
      label: '@skerryy',
      avatar: '/assets/avatar_agent5.png',
      name: '@skerryy',
    }),
    [agentLocation.lng, agentLocation.lat]
  )

  const markers = useMemo<Marker[]>(
    () => [userMarker, agentMarker],
    [userMarker, agentMarker]
  )

  // Route from dealer start to user
  const routeCoordinates = useMemo<[number, number][]>(
    () => [
      [agentLocation.lng, agentLocation.lat],
      [userLocation.lng, userLocation.lat],
    ],
    [agentLocation.lng, agentLocation.lat, userLocation.lng, userLocation.lat]
  )

  // Wait for container to exist before rendering map
  useEffect(() => {
    const timer = setTimeout(() => {
      const container = document.getElementById(mapContainerId)
      if (container) {
        setMapReady(true)
      }
    }, 100)

    return () => clearTimeout(timer)
  }, [mapContainerId])

  return (
    <div className={styles.mapCardInChat} onClick={onMapClick}>
      <div className={styles.mapContainer} id={mapContainerId} />
      {mapReady && (
        <MapboxMap
          containerId={mapContainerId}
          markers={markers}
          styleUrl="mapbox://styles/mapbox/navigation-day-v1"
          routeCoordinates={routeCoordinates}
          variant="popup"
          hqCoord={isWithdrawal ? undefined : { lng: HQ_COORD.lng, lat: HQ_COORD.lat }}
        />
      )}
      {/* Texture overlay */}
      <div className={styles.textureOverlay} aria-hidden="true">
        <Image
          src="/assets/texture.png"
          alt=""
          fill
          className={styles.textureOverlayImg}
          style={{ opacity: isWithdrawal ? 0.22 : 0.32 }}
          priority
        />
      </div>
    </div>
  )
}


'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import ActionSheet from './ActionSheet'
import MapboxMap, { type Marker } from './MapboxMap'
import AgentSummaryRow from './AgentSummaryRow'
import SuccessSheet from './SuccessSheet'
import { useNotificationStore } from '@/store/notifications'
import styles from './CashMapPopup.module.css'

type CashFlowState =
  | 'IDLE'
  | 'MATCHED_EN_ROUTE'
  | 'ARRIVED'
  | 'AWAITING_CONFIRMATION'
  | 'COMPLETED'
  | 'EXPIRED'

type CashMapPopupProps = {
  open: boolean
  onClose: () => void
  amount: number
  showAgentCard?: boolean
  onComplete?: () => void // Called when deposit is confirmed
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

export default function CashMapPopup({ open, onClose, amount, showAgentCard = false, onComplete }: CashMapPopupProps) {
  const [mapContainerId] = useState(() => `cash-map-popup-${Date.now()}`)
  const [cashFlowState, setCashFlowState] = useState<CashFlowState>('IDLE')
  const [showDepositSuccess, setShowDepositSuccess] = useState(false)
  const [currentDealerLocation, setCurrentDealerLocation] = useState({ lng: 28.0567, lat: -26.1069 })
  const [distance, setDistance] = useState(7.8)
  const [etaMinutes, setEtaMinutes] = useState(20)
  const [arrivalNotificationShown, setArrivalNotificationShown] = useState(false)
  
  const animationRef = useRef<number | null>(null)
  const expiryTimerRef = useRef<NodeJS.Timeout | null>(null)
  const { pushNotification } = useNotificationStore()
  
  // User location (static for now - could be from geolocation)
  const userLocation = useMemo(
    () => ({
      lng: 28.0483, // Slightly different from dealer for visibility
      lat: -26.1075,
    }),
    []
  )
  
  // Initial dealer location (Kerry) - will be animated
  const initialDealerLocation = useMemo(
    () => ({
      lng: 28.0567, // Sandton-ish
      lat: -26.1069,
    }),
    []
  )
  
  // User marker using character.png
  const userMarker: Marker = useMemo(
    () => ({
      id: 'user-location',
      lng: userLocation.lng,
      lat: userLocation.lat,
      kind: 'member' as const, // Will use character.png
      label: 'You',
      name: 'You',
    }),
    [userLocation.lng, userLocation.lat]
  )
  
  // Dealer marker using avatar_agent5.png (circular) - uses animated location
  const dealerMarker: Marker = useMemo(
    () => ({
      id: 'agent-on-way',
      lng: currentDealerLocation.lng,
      lat: currentDealerLocation.lat,
      kind: 'dealer' as const, // Special kind for circular avatar marker
      label: '$kerryy',
      avatar: '/assets/avatar_agent5.png',
      name: '$kerryy',
    }),
    [currentDealerLocation.lng, currentDealerLocation.lat]
  )
  
  // Stable markers array
  const markers = useMemo(
    () => [userMarker, dealerMarker],
    [userMarker, dealerMarker]
  )
  
  // Route coordinates for the line between user and dealer - uses animated location
  const routeCoordinates = useMemo<[number, number][]>(
    () => [
      [userLocation.lng, userLocation.lat],
      [currentDealerLocation.lng, currentDealerLocation.lat],
    ],
    [userLocation.lng, userLocation.lat, currentDealerLocation.lng, currentDealerLocation.lat]
  )

  // Calculate distance between two points (Haversine formula)
  const calculateDistance = useCallback((lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371 // Earth's radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180
    const dLng = ((lng2 - lng1) * Math.PI) / 180
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }, [])

  // Warp-speed dealer movement animation
  useEffect(() => {
    if (cashFlowState !== 'MATCHED_EN_ROUTE') {
      // Reset to initial position when not en route
      setCurrentDealerLocation(initialDealerLocation)
      setDistance(7.8)
      setEtaMinutes(20)
      return
    }

    const startTime = Date.now()
    const duration = 8000 // 8 seconds for warp speed
    const startLng = initialDealerLocation.lng
    const startLat = initialDealerLocation.lat
    const endLng = userLocation.lng
    const endLat = userLocation.lat

    const animate = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      
      // Ease-out function for smooth deceleration
      const eased = 1 - Math.pow(1 - progress, 3)

      // Interpolate position
      const currentLng = startLng + (endLng - startLng) * eased
      const currentLat = startLat + (endLat - startLat) * eased

      setCurrentDealerLocation({ lng: currentLng, lat: currentLat })

      // Update distance and ETA
      const remainingDist = calculateDistance(currentLat, currentLng, endLat, endLng)
      setDistance(Math.max(0, parseFloat(remainingDist.toFixed(1))))
      setEtaMinutes(Math.max(0, Math.round((remainingDist / 7.8) * 20)))

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate)
      } else {
        // Arrived!
        setCurrentDealerLocation({ lng: endLng, lat: endLat })
        setDistance(0)
        setEtaMinutes(0)
        setCashFlowState('ARRIVED')
      }
    }

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
    }
  }, [cashFlowState, initialDealerLocation, userLocation, calculateDistance])

  // Handle arrival: show notification
  useEffect(() => {
    if (cashFlowState === 'ARRIVED' && !arrivalNotificationShown) {
      setArrivalNotificationShown(true)
      
      // Show notification
      pushNotification({
        kind: 'request_sent',
        title: 'Complete your deposit',
        body: '$kerryy has arrived',
        actor: {
          type: 'system',
          id: 'system',
          name: 'System',
        },
      })
    }
  }, [cashFlowState, arrivalNotificationShown, pushNotification])

  // Auto-expiry TTL
  const cashFlowStateRef = useRef(cashFlowState)
  useEffect(() => {
    cashFlowStateRef.current = cashFlowState
  }, [cashFlowState])

  useEffect(() => {
    if (cashFlowState === 'ARRIVED') {
      expiryTimerRef.current = setTimeout(() => {
        // Use ref to check current state (avoid stale closure)
        if (cashFlowStateRef.current !== 'COMPLETED') {
          setCashFlowState('EXPIRED')
          onClose()
        }
      }, 120000) // 2 minutes
    }

    return () => {
      if (expiryTimerRef.current) {
        clearTimeout(expiryTimerRef.current)
        expiryTimerRef.current = null
      }
    }
  }, [cashFlowState, onClose])

  // Initialize state when popup opens
  useEffect(() => {
    if (open && cashFlowState === 'IDLE') {
      setCashFlowState('MATCHED_EN_ROUTE')
      setArrivalNotificationShown(false)
    } else if (!open) {
      // Reset on close
      setCashFlowState('IDLE')
      setShowDepositSuccess(false)
      setArrivalNotificationShown(false)
      setCurrentDealerLocation(initialDealerLocation)
      setDistance(7.8)
      setEtaMinutes(20)
    }
  }, [open, cashFlowState, initialDealerLocation])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      if (expiryTimerRef.current) {
        clearTimeout(expiryTimerRef.current)
      }
    }
  }, [])

  const handleWhatsAppClick = () => {
    if (typeof window === 'undefined') return
    window.open('https://wa.me/27823306256', '_blank')
  }

  const handleConfirmCashDeposited = () => {
    // Mark flow as completed and show success sheet
    setShowDepositSuccess(true)
    setCashFlowState('COMPLETED')
  }

  const handleCloseDepositSuccess = () => {
    setShowDepositSuccess(false)
    setCashFlowState('IDLE')
    // Close the map popup and reset flow
    if (onComplete) {
      onComplete()
    }
    onClose()
  }

  const isArrived = cashFlowState === 'ARRIVED'
  const cardTitle = isArrived ? 'Your dealer has arrived' : 'A dealer is coming to meet you'
  const arrivalTime = new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })

  return (
    <ActionSheet open={open} onClose={onClose} title="" size="tall" className={styles.cashMapPopup}>
      <div className={styles.agentPopupRoot}>
        {/* Map container - fills entire popup */}
        <div className={styles.agentPopupMap}>
          <div className={styles.mapContainer} id={mapContainerId} />
          <MapboxMap
            containerId={mapContainerId}
            markers={markers}
            styleUrl="mapbox://styles/mapbox/navigation-night-v1"
            routeCoordinates={routeCoordinates}
            variant="popup"
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
            <div className={styles.chipRow}>
              {!isArrived && (
                <>
                  <div className={styles.kmPill}>
                    <div className={styles.kmValue}>
                      <span className={styles.kmNumber}>{distance.toFixed(1)}</span>
                      <span className={styles.kmUnit}>km</span>
                    </div>
                  </div>
                  <div className={styles.etaPill}>
                    <span className={styles.etaLabel}>Arriving in</span>
                    <span className={styles.etaTime}>{etaMinutes} min</span>
                  </div>
                </>
              )}
              {isArrived && (
                <div className={styles.etaPill}>
                  <span className={styles.etaLabel}>{arrivalTime}</span>
                </div>
              )}
            </div>
            <button className={styles.cashMapClose} onClick={onClose} aria-label="Close">
              <Image src="/assets/clear.svg" alt="" width={18} height={18} />
            </button>
          </div>

          {/* Footer content - bottom region with single $kerryy row */}
          {(showAgentCard || cashFlowState !== 'IDLE') && (
            <div className={styles.mapSheetOuter}>
              <div className={styles.mapSheetInner}>
                {/* Title section */}
                <div className={styles.titleSection}>
                  <div className={styles.titleText}>{cardTitle}</div>
                  <div className={styles.divider}></div>
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

                {/* Confirm button - only show when dealer has arrived */}
                {cashFlowState === 'ARRIVED' && (
                  <div className={styles.confirmButtonSection}>
                    <button
                      className={styles.confirmButton}
                      onClick={handleConfirmCashDeposited}
                      type="button"
                    >
                      Confirm cash was deposited
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Success Sheet */}
      <SuccessSheet
        open={showDepositSuccess}
        onClose={handleCloseDepositSuccess}
        amountZAR={`R ${amount.toLocaleString('en-ZA', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`}
        kind="deposit"
        autoDownloadReceipt={false}
        headlineOverride="Cash deposit confirmed"
        subtitleOverride={`You deposited R ${amount.toLocaleString('en-ZA', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} with your GoBankless agent.`}
      />
    </ActionSheet>
  )
}


'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import ActionSheet from './ActionSheet'
import MapboxMap, { type Marker } from './MapboxMap'
import AgentSummaryRow from './AgentSummaryRow'
import SuccessSheet from './SuccessSheet'
import { useNotificationStore } from '@/store/notifications'
import { useCashFlowStateStore, type CashFlowState } from '@/state/cashFlowState'
import { useFinancialInboxStore } from '@/state/financialInbox'
import styles from './CashMapPopup.module.css'

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
  const [mapReady, setMapReady] = useState(false)
  const { cashFlowState, setCashFlowState } = useCashFlowStateStore()
  const { cashDepositScenario, cashWithdrawalScenario } = useFinancialInboxStore()
  const isWithdrawal = !!cashWithdrawalScenario
  const [showDepositSuccess, setShowDepositSuccess] = useState(false)
  const [confirmButtonDisabled, setConfirmButtonDisabled] = useState(false)
  const [notificationsSent, setNotificationsSent] = useState<Set<CashFlowState>>(new Set())
  const [currentDealerLocation, setCurrentDealerLocation] = useState(() => {
    // Initialize based on scenario type
    const { cashWithdrawalScenario } = useFinancialInboxStore.getState()
    if (cashWithdrawalScenario) {
      return { lng: 28.0520, lat: -26.1050 } // Withdrawal starting point
    }
    return { lng: 28.0560, lat: -26.1070 } // Deposit starting point (HQ)
  })
  const [distance, setDistance] = useState(7.8)
  const [etaMinutes, setEtaMinutes] = useState(20)
  const [arrivalNotificationShown, setArrivalNotificationShown] = useState(false)
  
  const animationRef = useRef<number | null>(null)
  const returnAnimationRef = useRef<number | null>(null)
  const expiryTimerRef = useRef<NodeJS.Timeout | null>(null)
  const { pushNotification } = useNotificationStore()
  
  // HQ coordinate
  const HQ_COORD = useMemo(
    () => ({
      lng: 28.0560,
      lat: -26.1070,
    }),
    []
  )

  // User location (static for now - could be from geolocation)
  const userLocation = useMemo(
    () => ({
      lng: 28.0483, // Slightly different from dealer for visibility
      lat: -26.1075,
    }),
    []
  )
  
  // Initial dealer location (Kerry) - for deposit starts at HQ, for withdrawal starts at different location
  const initialDealerLocation = useMemo(
    () => {
      if (isWithdrawal) {
        // For withdrawal, dealer starts at a different location (not HQ)
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
      label: '@skerryy',
      avatar: '/assets/avatar_agent5.png',
      name: '@skerryy',
    }),
    [currentDealerLocation.lng, currentDealerLocation.lat]
  )

  // Stable markers array (HQ marker handled separately in MapboxMap)
  const markers = useMemo<Marker[]>(
    () => [userMarker, dealerMarker],
    [userMarker, dealerMarker]
  )
  
  // Static routes - computed once per leg, not on every position update
  const hqToUserRoute = useMemo<[number, number][]>(
    () => [
      [HQ_COORD.lng, HQ_COORD.lat],
      [userLocation.lng, userLocation.lat],
    ],
    [HQ_COORD.lng, HQ_COORD.lat, userLocation.lng, userLocation.lat]
  )

  const userToHqRoute = useMemo<[number, number][]>(
    () => [
      [userLocation.lng, userLocation.lat],
      [HQ_COORD.lng, HQ_COORD.lat],
    ],
    [HQ_COORD.lng, HQ_COORD.lat, userLocation.lng, userLocation.lat]
  )

  // Route coordinates - switch between static routes based on state and scenario type
  const routeCoordinates = useMemo<[number, number][]>(() => {
    if (isWithdrawal) {
      // Withdrawal: dealer start → user (no return trip)
      return [
        [initialDealerLocation.lng, initialDealerLocation.lat],
        [userLocation.lng, userLocation.lat],
      ]
    }
    if (cashFlowState === 'IN_TRANSIT_TO_HQ' || cashFlowState === 'COMPLETED') {
      // Return trip: user → HQ (deposit only)
      return userToHqRoute
    } else {
      // Outbound trip: HQ → user (for MATCHED_EN_ROUTE and ARRIVED)
      return hqToUserRoute
    }
  }, [cashFlowState, hqToUserRoute, userToHqRoute, isWithdrawal, initialDealerLocation.lng, initialDealerLocation.lat, userLocation.lng, userLocation.lat])

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

  // Warp-speed dealer movement animation (dealer start → user)
  useEffect(() => {
    if (cashFlowState !== 'MATCHED_EN_ROUTE') {
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
  }, [cashFlowState, initialDealerLocation.lng, initialDealerLocation.lat, userLocation, calculateDistance])

  // Return animation (user → HQ) - only for deposit flow
  useEffect(() => {
    if (cashFlowState !== 'IN_TRANSIT_TO_HQ' || isWithdrawal) {
      return
    }

    const startTime = Date.now()
    const duration = 8000 // 8 seconds for warp speed
    const startLng = userLocation.lng
    const startLat = userLocation.lat
    const endLng = HQ_COORD.lng
    const endLat = HQ_COORD.lat

    const animate = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      
      // Ease-out function for smooth deceleration
      const eased = 1 - Math.pow(1 - progress, 3)

      // Interpolate position
      const currentLng = startLng + (endLng - startLng) * eased
      const currentLat = startLat + (endLat - startLat) * eased

      setCurrentDealerLocation({ lng: currentLng, lat: currentLat })

      // Update distance and ETA (from current position to HQ)
      const remainingDist = calculateDistance(currentLat, currentLng, endLat, endLng)
      setDistance(Math.max(0, parseFloat(remainingDist.toFixed(1))))
      setEtaMinutes(Math.max(0, Math.round((remainingDist / 7.8) * 20)))

      if (progress < 1) {
        returnAnimationRef.current = requestAnimationFrame(animate)
      } else {
        // Reached HQ!
        setCurrentDealerLocation({ lng: endLng, lat: endLat })
        setDistance(0)
        setEtaMinutes(0)
        setCashFlowState('COMPLETED')
      }
    }

    returnAnimationRef.current = requestAnimationFrame(animate)

    return () => {
      if (returnAnimationRef.current) {
        cancelAnimationFrame(returnAnimationRef.current)
        returnAnimationRef.current = null
      }
    }
  }, [cashFlowState, HQ_COORD.lng, HQ_COORD.lat, userLocation, calculateDistance, isWithdrawal])

  // Notifications for each state transition
  useEffect(() => {
    if (cashFlowState === 'MATCHED_EN_ROUTE' && !notificationsSent.has('MATCHED_EN_ROUTE')) {
      setNotificationsSent((prev) => new Set(prev).add('MATCHED_EN_ROUTE'))
      pushNotification({
        kind: 'request_sent',
        title: 'Cash-in agent on the way',
        body: '$kerryy is on the way to collect your cash.',
        actor: {
          type: 'system',
          id: 'system',
          name: 'System',
        },
      })
    } else if (cashFlowState === 'ARRIVED' && !notificationsSent.has('ARRIVED')) {
      setNotificationsSent((prev) => new Set(prev).add('ARRIVED'))
      pushNotification({
        kind: 'request_sent',
        title: 'Dealer has arrived',
        body: 'Meet $kerryy and deposit your cash. Ask them to confirm PIN 0747.',
        actor: {
          type: 'system',
          id: 'system',
          name: 'System',
        },
      })
    } else if (cashFlowState === 'IN_TRANSIT_TO_HQ' && !notificationsSent.has('IN_TRANSIT_TO_HQ')) {
      setNotificationsSent((prev) => new Set(prev).add('IN_TRANSIT_TO_HQ'))
      pushNotification({
        kind: 'request_sent',
        title: 'Cash in transit to HQ',
        body: 'Your deposit is on its way to GoBankless HQ.',
        actor: {
          type: 'system',
          id: 'system',
          name: 'System',
        },
      })
    }
  }, [cashFlowState, notificationsSent, pushNotification])

  // Auto-open SuccessSheet when COMPLETED
  useEffect(() => {
    if (cashFlowState === 'COMPLETED') {
      setShowDepositSuccess(true)
    }
  }, [cashFlowState])

  // Auto-expiry TTL
  const cashFlowStateRef = useRef(cashFlowState)
  useEffect(() => {
    cashFlowStateRef.current = cashFlowState
  }, [cashFlowState])

  useEffect(() => {
    if (cashFlowState === 'ARRIVED' || cashFlowState === 'IN_TRANSIT_TO_HQ') {
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

  // Wait for map container to exist in DOM before rendering MapboxMap
  useEffect(() => {
    if (!open) {
      setMapReady(false)
      return
    }

    let retryTimer: NodeJS.Timeout | null = null

    // Wait for ActionSheet portal to mount and container to be available
    const timer = setTimeout(() => {
      const container = document.getElementById(mapContainerId)
      if (container) {
        setMapReady(true)
      } else {
        // Retry if container not found
        retryTimer = setTimeout(() => {
          const retryContainer = document.getElementById(mapContainerId)
          if (retryContainer) {
            setMapReady(true)
          }
        }, 200)
      }
    }, 100)

    return () => {
      clearTimeout(timer)
      if (retryTimer) {
        clearTimeout(retryTimer)
      }
    }
  }, [open, mapContainerId])

  // Initialize state when popup opens
  useEffect(() => {
    if (open && cashFlowState === 'IDLE') {
      setCashFlowState('MATCHED_EN_ROUTE')
      setArrivalNotificationShown(false)
    } else if (!open) {
      // Don't reset state on close - let chat continue to track it
      // Only reset UI state, not the flow state
      setShowDepositSuccess(false)
      setArrivalNotificationShown(false)
      setConfirmButtonDisabled(false)
      setNotificationsSent(new Set())
      setCurrentDealerLocation({ lng: HQ_COORD.lng, lat: HQ_COORD.lat })
      setDistance(7.8)
      setEtaMinutes(20)
      setMapReady(false) // Reset map ready state
    }
  }, [open, cashFlowState, HQ_COORD.lng, HQ_COORD.lat, setCashFlowState])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      if (returnAnimationRef.current) {
        cancelAnimationFrame(returnAnimationRef.current)
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
    setConfirmButtonDisabled(true)
    if (isWithdrawal) {
      setCashFlowState('WITHDRAWAL_CONFIRMED')
    } else {
      setCashFlowState('IN_TRANSIT_TO_HQ')
    }
  }
  
  // Sync local state to shared store when popup opens/closes
  useEffect(() => {
    if (open && cashFlowState === 'IDLE') {
      setCashFlowState('MATCHED_EN_ROUTE')
    } else if (!open) {
      // Don't reset state on close - let chat continue to track it
      // Only reset if explicitly completing
      if (cashFlowState === 'COMPLETED' && onComplete) {
        onComplete()
      }
    }
  }, [open, cashFlowState, setCashFlowState, onComplete])

  const handleDepositSuccessClose = () => {
    setShowDepositSuccess(false)
    setCashFlowState('IDLE')
    // Close the map popup and reset flow
    if (onComplete) {
      onComplete()
    }
    onClose()
  }

  // Determine card title based on state
  const getCardTitle = () => {
    switch (cashFlowState) {
      case 'ARRIVED':
        return 'Your dealer has arrived'
      case 'IN_TRANSIT_TO_HQ':
        return 'Cash in transit to HQ'
      case 'COMPLETED':
        return 'Cash in transit to HQ' // Keep showing until SuccessSheet opens
      default:
        return 'A dealer is coming to meet you'
    }
  }

  const cardTitle = getCardTitle()
  const arrivalTime = new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
  
  // Show distance/ETA badges when en route or at client (ARRIVED shows 0.0 km)
  const showDistanceBadges = cashFlowState === 'MATCHED_EN_ROUTE' || cashFlowState === 'ARRIVED' || cashFlowState === 'IN_TRANSIT_TO_HQ'
  const isAtDestination = cashFlowState === 'COMPLETED'
  const isReturnTrip = cashFlowState === 'IN_TRANSIT_TO_HQ'
  const isArrivedAtClient = cashFlowState === 'ARRIVED'

  return (
    <ActionSheet open={open} onClose={onClose} title="" size="tall" className={styles.cashMapPopup}>
      <div className={styles.agentPopupRoot}>
        {/* Map container - fills entire popup */}
        <div className={styles.agentPopupMap}>
          <div className={styles.mapContainer} id={mapContainerId} />
          {mapReady && (
            <MapboxMap
              containerId={mapContainerId}
              markers={markers}
              styleUrl="mapbox://styles/mapbox/navigation-day-v1"
              routeCoordinates={routeCoordinates}
              variant="popup"
              hqCoord={undefined}
            />
          )}
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

        {/* Overlay - contains close button and card */}
        <div className={styles.agentPopupOverlay}>
          {/* Top bar with distance, ETA, and close button */}
          <div className={styles.mapTopBar}>
            <div className={styles.chipRow}>
              {showDistanceBadges && (
                <>
                  <div className={styles.kmPill}>
                    <div className={styles.kmValue}>
                      <span className={styles.kmNumber}>{distance.toFixed(1)}</span>
                      <span className={styles.kmUnit}>km</span>
                    </div>
                  </div>
                  {isArrivedAtClient ? (
                    <div className={styles.etaPill} style={{ minWidth: 'auto', padding: '12px 16px' }}>
                      <span className={styles.etaLabel}>Arrived</span>
                    </div>
                  ) : (
                    <div className={styles.etaPill}>
                      <span className={styles.etaLabel}>
                        {isReturnTrip ? 'Arriving at HQ in' : 'Arriving in'}
                      </span>
                      <span className={styles.etaTime}>{etaMinutes} min</span>
                    </div>
                  )}
                </>
              )}
              {isAtDestination && (
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
                      disabled={confirmButtonDisabled}
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

      {/* Deposit Success Sheet */}
      <SuccessSheet
        open={showDepositSuccess}
        onClose={handleDepositSuccessClose}
        amountZAR={`R ${amount.toLocaleString('en-ZA', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`}
        kind="deposit"
        autoDownloadReceipt={false}
        headlineOverride="Cash conversion confirmed"
        subtitleOverride={`You converted R ${amount.toLocaleString('en-ZA', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} in cash to crypto.`}
        receiptOverride="Proof of payment will be emailed to you."
      />
    </ActionSheet>
  )
}


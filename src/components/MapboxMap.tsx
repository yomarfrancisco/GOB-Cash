'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { Feature, LineString } from 'geojson'
import styles from './MapboxMap.module.css'
import { useMapHighlightStore } from '@/state/mapHighlight'
import { DEMO_AGENTS } from '@/lib/demo/demoAgents'
// static import so Next bundles it and gives us a stable .src
import userIcon from '../../public/assets/character.png'

export type Marker = {
  id: string
  lng: number
  lat: number
  kind?: 'dealer' | 'branch' | 'member' | 'co_op'
  label?: string
  avatar?: string // Avatar URL for member/co-op markers
  name?: string // Name for member/co-op markers
}

interface Props {
  className?: string
  containerId?: string // ID of existing container element
  initialCenter?: [number, number] // [lng, lat]
  initialZoom?: number
  markers?: Marker[]
  fitToMarkers?: boolean
  styleUrl?: string // e.g. "mapbox://styles/mapbox/light-v11"
  showDebug?: boolean
}

const DEBUG_MAP =
  process.env.NEXT_PUBLIC_DEBUG_MAP === '1' ||
  (typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('debugMap') === '1')

export default function MapboxMap({
  className,
  containerId,
  initialCenter = [28.0567, -26.1069], // Sandton-ish
  initialZoom = 14,
  markers = [],
  fitToMarkers = true,
  styleUrl = 'mapbox://styles/mapbox/streets-v12',
  showDebug = DEBUG_MAP,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const loadedRef = useRef(false)
  const roRef = useRef<ResizeObserver | null>(null)
  const lastSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 })
  const logsRef = useRef<string[]>([])
  const [logs, setLogs] = useState<string[]>([])
  const [hasError, setHasError] = useState(false)
  const [userLngLat, setUserLngLat] = useState<[number, number] | null>(null)
  const [routeData, setRouteData] = useState<Feature<LineString> | null>(null)
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const savedCenterRef = useRef<[number, number] | null>(null)
  const savedZoomRef = useRef<number | null>(null)
  const highlightMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const agentMarkersRef = useRef<Map<string, mapboxgl.Marker>>(new Map())
  const cameraLockedUntilRef = useRef<number>(0) // Timestamp when camera lock expires
  
  const highlight = useMapHighlightStore((state) => state.highlight)
  
  // Get demo agents as markers if in demo mode
  const demoAgentMarkers: Marker[] = 
    process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
      ? DEMO_AGENTS.map((agent) => ({
          id: agent.id,
          lng: agent.lng,
          lat: agent.lat,
          kind: 'member' as const,
          label: agent.name,
          avatar: agent.avatar,
          name: agent.name,
        }))
      : []

  const log = (message: string) => {
    const timestamped = `${new Date().toISOString()}  ${message}`
    logsRef.current = [...logsRef.current.slice(-200), timestamped]
    if (showDebug) {
      console.log(`[MapboxMap] ${message}`)
      // Update state only for debug display, throttled
      setLogs([...logsRef.current])
    }
  }

  // Haversine distance helpers (reusable)
  const toRad = (d: number) => (d * Math.PI) / 180
  const R = 6371000
  const distMeters = (a: [number, number], b: [number, number]) => {
    const dLat = toRad(b[1] - a[1])
    const dLng = toRad(b[0] - a[0])
    const lat1 = toRad(a[1])
    const lat2 = toRad(b[1])
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
    return 2 * R * Math.asin(Math.sqrt(s))
  }

  // Initialize map exactly once
  useEffect(() => {
    // Get container - either by ID or ref
    const container = containerId
      ? document.getElementById(containerId)
      : containerRef.current

    if (!container) {
      log('error: container not found')
      return
    }

    // Guard: prevent double initialization
    if (mapRef.current) {
      log('skip: map already initialized')
      return
    }

    // Ensure container is empty
    if (container.children.length > 0) {
      log('warning: container has children, clearing')
      container.innerHTML = ''
    }

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''
    log(`init style=${styleUrl} token=${token.slice(0, 8)}…`)

    if (!token) {
      log('error: no token found')
      setHasError(true)
      return
    }

    mapboxgl.accessToken = token

    log('construct map')
    const map = new mapboxgl.Map({
      container: container,
      style: 'mapbox://styles/mapbox/navigation-day-v1',
      center: initialCenter,
      zoom: initialZoom,
      attributionControl: false,
      cooperativeGestures: true,
      preserveDrawingBuffer: false,
    })

    // Mobile UX: keep the card feel
    map.dragRotate.disable()
    map.touchZoomRotate.enable()
    map.touchZoomRotate.disableRotation()

    // Register event listeners - NO state updates inside
    map.on('load', () => {
      loadedRef.current = true
      log('event: load')

      const geolocate = new mapboxgl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserLocation: false, // hide default dot
        showAccuracyCircle: false,
      })

      map.addControl(geolocate, 'top-right')

      // Add branch marker (Sandton City)
      const branchLngLat: [number, number] = [28.054167, -26.108333]
      const branchEl = document.createElement('div')
      branchEl.className = styles.branchMarker
      new mapboxgl.Marker(branchEl).setLngLat(branchLngLat).addTo(map)
      log(`branch marker added at [${branchLngLat[0]}, ${branchLngLat[1]}]`)

      // Helper to (re)place custom user marker
      function upsertUserMarker(lng: number, lat: number) {
        // create DOM element once
        let el = userMarkerRef.current?.getElement()
        if (!el) {
          el = document.createElement('div')
          el.className = styles.userMarker
          // add our PNG as <img> to preserve sharpness on retina
          const img = document.createElement('img')
          img.className = styles.userImg
          img.alt = 'You are here'
          // Use static import if available, else fall back to public path:
          const userIconUrl = (userIcon as any)?.src ?? '/assets/character.png'
          img.src = userIconUrl
          // Helpful diagnostics the first time we deploy
          img.addEventListener('load', () =>
            log(
              `[user-icon] loaded w=${img.naturalWidth} h=${img.naturalHeight} url=${userIconUrl}`
            )
          )
          img.addEventListener('error', (e) =>
            console.error('[user-icon] failed to load', userIconUrl, e)
          )
          img.decoding = 'async'
          img.loading = 'eager'
          img.referrerPolicy = 'no-referrer'
          el.appendChild(img)
          userMarkerRef.current = new mapboxgl.Marker({
            element: el,
            anchor: 'center',
          })
            .setLngLat([lng, lat])
            .addTo(map)
        } else {
          userMarkerRef.current!.setLngLat([lng, lat])
        }
      }

      let centeredOnce = false

      geolocate.on('geolocate', (e: any) => {
        const lng = e.coords.longitude
        const lat = e.coords.latitude

        // Update custom user marker on every geolocate event
        upsertUserMarker(lng, lat)

        // (optional) keep map centered on the user when first found
        if (!centeredOnce) {
          centeredOnce = true
          map.setCenter([lng, lat])
          // Set user location state (will trigger zoom effect)
          setUserLngLat([lng, lat])
          console.log('[Mapbox] Centered on user:', { lng, lat })
        } else {
          // Update user location state for route recalculation
          setUserLngLat([lng, lat])
        }
      })

      // Trigger geolocate after a short delay
      setTimeout(() => {
        try {
          geolocate.trigger()
        } catch (err) {
          console.warn('[Mapbox] Geolocate trigger failed', err)
        }
      }, 500)

      // Trigger resize after load - use requestAnimationFrame to avoid reflow
      requestAnimationFrame(() => {
        if (mapRef.current) {
          mapRef.current.resize()
          log('resize after load (raf)')
        }
      })
    })

    map.on('styledata', () => {
      log('event: styledata')
    })

    map.on('idle', () => {
      log('event: idle')
    })

    map.on('error', (e) => {
      const errorMsg = e?.error?.message ?? 'unknown'
      log(`event: error → ${errorMsg}`)
      // Only set error state, no other state updates
      setHasError(true)
    })

    map.on('remove', () => {
      log('event: remove')
    })

    // Retry if styledata hasn't fired within 3s
    const retryTimeout = setTimeout(() => {
      if (!loadedRef.current && mapRef.current) {
        mapRef.current.setStyle(styleUrl)
        log('retry: setStyle again')
      }
    }, 3000)

    mapRef.current = map

    // Throttled ResizeObserver with size checks
    let rafId = 0
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect
      if (!cr) return

      const w = Math.round(cr.width)
      const h = Math.round(cr.height)

      // Ignore zero size
      if (w === 0 || h === 0) {
        log(`resizeObserver: zero size (${w}x${h}), skipping`)
        return
      }

      // Ignore unchanged size
      if (w === lastSizeRef.current.w && h === lastSizeRef.current.h) {
        return
      }

      lastSizeRef.current = { w, h }
      log(`resizeObserver: size changed to ${w}x${h}`)

      // Throttle with requestAnimationFrame
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        if (mapRef.current) {
          mapRef.current.resize()
          log('resizeObserver → map.resize() (raf)')
        }
      })
    })

    ro.observe(container)
    roRef.current = ro

    // Handle orientation change - throttled
    let orientationRaf = 0
    const handleOrientationChange = () => {
      cancelAnimationFrame(orientationRaf)
      orientationRaf = requestAnimationFrame(() => {
        if (mapRef.current) {
          mapRef.current.resize()
          log('orientationchange → map.resize() (raf)')
        }
      })
    }
    window.addEventListener('orientationchange', handleOrientationChange)

    return () => {
      clearTimeout(retryTimeout)
      cancelAnimationFrame(rafId)
      cancelAnimationFrame(orientationRaf)
      if (roRef.current) {
        roRef.current.disconnect()
        roRef.current = null
      }
      window.removeEventListener('orientationchange', handleOrientationChange)
      // Clean up user marker
      if (userMarkerRef.current) {
        userMarkerRef.current.remove()
        userMarkerRef.current = null
      }
      log('cleanup—remove map')
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [styleUrl, containerId, showDebug]) // Minimal deps - only styleUrl and containerId

  // Separate effect to add/update markers when map is loaded (without re-initializing map)
  useEffect(() => {
    if (!mapRef.current || !loadedRef.current || !markers) return

    const log = (message: string) => {
      const timestamped = `${new Date().toISOString()}  ${message}`
      logsRef.current = [...logsRef.current.slice(-200), timestamped]
      if (showDebug) {
        console.log(`[MapboxMap] ${message}`)
        setLogs([...logsRef.current])
      }
    }

    // Track created markers for cleanup
    const created: mapboxgl.Marker[] = []

    // Clear existing markers by removing all markers from the map
    // We'll track new ones and clean them up on unmount
    if (markers.length === 0) {
      log('no markers to add')
      return
    }

    // Add new markers - use avatar markers for members/co-op, default pin for branches/dealers
    log(`adding ${markers.length} markers`)
    markers.forEach((m) => {
      let marker: mapboxgl.Marker
      
      if (m.kind === 'member' || m.kind === 'co_op') {
        // Create avatar marker
        const el = document.createElement('div')
        el.className = 'map-avatar-marker'
        el.style.width = '40px'
        el.style.height = '40px'
        el.style.borderRadius = '50%'
        el.style.overflow = 'hidden'
        el.style.background = '#ffffff'
        el.style.border = 'none'
        el.style.boxShadow = 'none'
        
        const img = document.createElement('img')
        img.src = m.avatar || '/assets/avatar_agent5.png'
        img.alt = m.name || m.label || ''
        img.style.width = '100%'
        img.style.height = '100%'
        img.style.objectFit = 'cover'
        img.style.display = 'block'
        el.appendChild(img)
        
        marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([m.lng, m.lat])
          .setPopup(new mapboxgl.Popup({ offset: 12 }).setText(m.label || m.name || ''))
          .addTo(mapRef.current!)
      } else {
        // Default Mapbox pin for branches/dealers
        marker = new mapboxgl.Marker()
          .setLngLat([m.lng, m.lat])
          .setPopup(new mapboxgl.Popup({ offset: 12 }).setText(m.label ?? ''))
          .addTo(mapRef.current!)
      }

      created.push(marker)
      agentMarkersRef.current.set(m.id, marker)
      log(`marker added: ${m.id} at [${m.lng}, ${m.lat}]`)
    })

    // Cleanup function
    return () => {
      created.forEach((marker) => {
        marker.remove()
        // Remove from agent markers ref
        agentMarkersRef.current.forEach((m, id) => {
          if (m === marker) {
            agentMarkersRef.current.delete(id)
          }
        })
      })
    }
  }, [markers, showDebug])
  
  // Add demo agent markers when in demo mode
  useEffect(() => {
    if (!mapRef.current || !loadedRef.current) return
    if (process.env.NEXT_PUBLIC_DEMO_MODE !== 'true') return
    
    // Add demo agents as persistent markers
    demoAgentMarkers.forEach((agent) => {
      if (agentMarkersRef.current.has(agent.id)) return // Already added
      
      const el = document.createElement('div')
      el.className = 'map-avatar-marker'
      el.style.width = '40px'
      el.style.height = '40px'
      el.style.borderRadius = '50%'
      el.style.overflow = 'hidden'
      el.style.background = '#ffffff'
      el.style.border = 'none'
      el.style.boxShadow = 'none'
      
      const img = document.createElement('img')
      img.src = agent.avatar || '/assets/avatar_agent5.png'
      img.alt = agent.name || ''
      img.style.width = '100%'
      img.style.height = '100%'
      img.style.objectFit = 'cover'
      img.style.display = 'block'
      el.appendChild(img)
      
      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([agent.lng, agent.lat])
        .setPopup(new mapboxgl.Popup({ offset: 12 }).setText(agent.name || ''))
        .addTo(mapRef.current!)
      
      agentMarkersRef.current.set(agent.id, marker)
    })
    
    return () => {
      // Don't remove demo agents on cleanup - they should persist
    }
  }, [demoAgentMarkers])

  // Effect to handle map highlighting from notifications
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return

    if (highlight) {
      // Save current map state
      const center = map.getCenter()
      const zoom = map.getZoom()
      savedCenterRef.current = [center.lng, center.lat]
      savedZoomRef.current = zoom

      // Lock camera for the duration of highlight animation + dwell time
      // flyTo duration: 1000ms, dwell time: 3500ms, return flight: 1000ms
      const totalLockDuration = 1000 + 3500 + 1000 // 5.5 seconds total
      cameraLockedUntilRef.current = Date.now() + totalLockDuration

      // Pan to highlight location using flyTo for smoother animation
      map.flyTo({
        center: [highlight.lng, highlight.lat],
        zoom: Math.max(zoom, 15), // Zoom in if needed
        duration: 1000,
        essential: true,
      })

      // Find the existing marker for this highlight and pulse it
      // Don't create a new marker - use the existing one
      const existingMarker = agentMarkersRef.current.get(highlight.id)
      
      if (existingMarker) {
        // Pulse the existing marker by adding animation to its element
        const markerEl = existingMarker.getElement()
        if (markerEl) {
          markerEl.style.animation = 'mapMarkerPulse 1s ease-in-out infinite'
          
          // Add pulse animation style if not already present
          if (!document.getElementById('map-marker-pulse-style')) {
            const style = document.createElement('style')
            style.id = 'map-marker-pulse-style'
            style.textContent = `
              @keyframes mapMarkerPulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.15); }
              }
            `
            document.head.appendChild(style)
          }
          
          // Remove animation after highlight clears
          setTimeout(() => {
            if (markerEl) {
              markerEl.style.animation = ''
            }
          }, 3500)
        }
      }

      // No cleanup needed - we're using existing markers
    } else if (savedCenterRef.current && savedZoomRef.current) {
      // Return to saved position when highlight clears
      // Lock camera during return flight as well
      cameraLockedUntilRef.current = Date.now() + 1000 // 1 second for return flight
      
      map.flyTo({
        center: savedCenterRef.current,
        zoom: savedZoomRef.current,
        duration: 1000,
        essential: true,
      })
      
      // Clear lock after return flight completes
      setTimeout(() => {
        cameraLockedUntilRef.current = 0
      }, 1000)
      
      savedCenterRef.current = null
      savedZoomRef.current = null
    }
  }, [highlight])

  // Effect to keep nearest branch in view while user stays centered
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!loadedRef.current) return // ensure map is fully loaded
    if (!userLngLat) return
    if (!markers?.length) return

    // Filter branches
    const branches = markers.filter((m) => m.kind === 'branch')
    if (!branches.length) return

    const [userLng, userLat] = userLngLat

    // Find nearest branch
    let nearest = branches[0]
    let best = distMeters([userLng, userLat], [nearest.lng, nearest.lat])
    for (let i = 1; i < branches.length; i++) {
      const d = distMeters([userLng, userLat], [branches[i].lng, branches[i].lat])
      if (d < best) {
        best = d
        nearest = branches[i]
      }
    }

    // Compute zoom so that distance to nearest branch fits inside current viewport
    // while keeping user at center. We do this by ensuring the distance fits
    // into min(halfWidth, halfHeight) minus padding, using meters-per-pixel.
    const container = map.getContainer()
    const halfW = container.clientWidth / 2
    const halfH = container.clientHeight / 2
    const padding = 32 // px safe padding
    const usable = Math.max(1, Math.min(halfW, halfH) - padding) // px to edge

    // meters-per-pixel at given latitude and zoom:
    // mpp = cos(lat)*2πR / (256 * 2^z)  =>  z = log2(cos(lat)*2πR / (256*mpp))
    const circ = 2 * Math.PI * R
    const metersPerPixelNeeded = best / usable
    const rawZoom = Math.log2(
      (Math.cos(toRad(userLat)) * circ) / (256 * Math.max(1e-6, metersPerPixelNeeded))
    )
    const targetZoom = Math.min(16, Math.max(3, rawZoom)) // clamp

    // Center stays on user, only zoom changes
    // BUT: Don't recenter if camera is locked (during highlight animations)
    if (Date.now() < cameraLockedUntilRef.current) {
      // Camera is locked - skip recentering but still update zoom if needed
      // This prevents GPS updates from interrupting highlight animations
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[map] camera locked, skipping recenter')
      }
      return
    }

    // Debounce micro-bursts from geolocate with rAF
    requestAnimationFrame(() => {
      // Make sure center is the user (in case geolocate ran earlier)
      map.setCenter([userLng, userLat])
      map.easeTo({ zoom: targetZoom, duration: 500 })
      if (process.env.NODE_ENV !== 'production') {
        console.debug(
          '[map] user @',
          userLngLat,
          'nearest branch @',
          [nearest.lng, nearest.lat],
          'dist(m)=',
          Math.round(best),
          'zoom=',
          targetZoom.toFixed(2)
        )
      }
    })
  }, [userLngLat, markers]) // not depending on initialZoom/Center; we only care once user+markers exist

  // Effect 1: Fetch route from user to nearest branch
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!loadedRef.current) return
    if (!userLngLat) return
    if (!markers?.length) return

    const branches = markers.filter((m) => m.kind === 'branch')
    if (!branches.length) return

    const [userLng, userLat] = userLngLat

    // Find nearest branch
    let nearest = branches[0]
    let best = distMeters([userLng, userLat], [nearest.lng, nearest.lat])
    for (let i = 1; i < branches.length; i++) {
      const d = distMeters([userLng, userLat], [branches[i].lng, branches[i].lat])
      if (d < best) {
        best = d
        nearest = branches[i]
      }
    }

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token) {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[map] no token; using straight-line fallback route')
      }
      setRouteData({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [userLng, userLat],
            [nearest.lng, nearest.lat],
          ],
        },
        properties: {},
      })
      return
    }

    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${userLng},${userLat};${nearest.lng},${nearest.lat}?geometries=geojson&overview=full&access_token=${token}`

    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((json) => {
        const geom = json?.routes?.[0]?.geometry
        if (geom?.type === 'LineString') {
          setRouteData({ type: 'Feature', geometry: geom, properties: {} })
          if (process.env.NODE_ENV !== 'production') {
            console.debug('[map] directions route loaded', {
              branch: nearest.label || nearest.id,
              meters: Math.round(best),
            })
          }
        } else {
          // Fallback
          setRouteData({
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [
                [userLng, userLat],
                [nearest.lng, nearest.lat],
              ],
            },
            properties: {},
          })
          if (process.env.NODE_ENV !== 'production') {
            console.debug('[map] directions missing geometry; using fallback line')
          }
        }
      })
      .catch(() => {
        setRouteData({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [userLng, userLat],
              [nearest.lng, nearest.lat],
            ],
          },
          properties: {},
        })
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[map] directions fetch failed; using fallback line')
        }
      })
  }, [userLngLat, markers])

  // Effect 2: Draw / update route layer
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return

    const srcId = 'route-user-branch'
    const layerId = 'route-user-branch-line'

    if (!routeData) {
      // Remove if previously added
      if (map.getLayer(layerId)) map.removeLayer(layerId)
      if (map.getSource(srcId)) map.removeSource(srcId)
      return
    }

    if (!map.getSource(srcId)) {
      map.addSource(srcId, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [routeData] },
      })
    } else {
      const src = map.getSource(srcId) as mapboxgl.GeoJSONSource
      src.setData({ type: 'FeatureCollection', features: [routeData] })
    }

    if (!map.getLayer(layerId)) {
      map.addLayer({
        id: layerId,
        type: 'line',
        source: srcId,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#111111',
          'line-opacity': 0.85,
          'line-width': 4,
          'line-blur': 0.5,
        },
      })
    }
  }, [routeData])

  // If containerId is provided, we don't render our own container
  // Fallback and debug overlay will be rendered as siblings in the parent
  if (containerId) {
    return null // Container is managed by parent, we just initialize into it
  }

  // Fallback: render our own container if no containerId
  return (
    <div ref={containerRef} className={`${styles.mapShell} ${className || ''}`}>
      {hasError && (
        <div className={styles.fallback}>
          <Image
            src="/assets/map.png"
            alt="Johannesburg/Sandton map (fallback)"
            fill
            style={{ objectFit: 'cover' }}
          />
        </div>
      )}
      {showDebug && (
        <pre className={styles.debug}>{logs.join('\n')}</pre>
      )}
    </div>
  )
}


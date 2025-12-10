# Production Map Implementation Guide

**Production Commit:** `7aa9bbb` (main branch)

This document provides a complete code-level explanation of how the production map behaves, how markers are implemented, and a step-by-step recipe to recreate it from scratch.

---

## 1. Map Behavior: Landing vs Post-Sign-In

### Component Rendering

**File:** `src/components/ConvertCashSection.tsx`

The map is rendered in the `ConvertCashSection` component:

```typescript
export default function ConvertCashSection({ onHelpClick }: ConvertCashSectionProps) {
  const isAuthed = useAuthStore((s) => s.isAuthed)

  return (
    <MapboxMap
      containerId="mapbox-container"
      markers={[sandtonBranch, ...BRANCH_MARKERS]}
      styleUrl="mapbox://styles/mapbox/navigation-day-v1"
      variant="landing"  // Always "landing" in production
      initialCenter={SADC_CENTER}  // [30, -23]
      initialZoom={SADC_ZOOM}  // 4.2
      fitToMarkers={false}
      isAuthed={isAuthed}  // Passed from auth store
    />
  )
}
```

**Key points:**
- `variant` is always `"landing"` (hardcoded)
- `isAuthed` comes from `useAuthStore` (Zustand store)
- `initialCenter` and `initialZoom` are SADC-wide constants

### Auth State Detection

**File:** `src/store/auth.ts`

Auth state is managed via Zustand:

```typescript
export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthed: false,
  // ...
  completeAuth: () => {
    stopDemoNotificationEngine()
    clearNotifications()
    set({ isAuthed: true, authOpen: false, ... })
  },
}))
```

After entering password `brics2025`, `completeAuth()` sets `isAuthed: true`.

---

### Landing (Pre-Sign-In) Map Behavior

#### Map Initialization

**File:** `src/components/MapboxMap.tsx` (lines 186-194)

```typescript
const map = new mapboxgl.Map({
  container: container,
  style: styleUrl,
  center: initialCenter,  // [30, -23] (SADC_CENTER)
  zoom: initialZoom,  // 4.2 (SADC_ZOOM)
  attributionControl: false,
  cooperativeGestures: true,
  preserveDrawingBuffer: false,
})
```

**Initial state:** Map starts at SADC-wide view (center `[30, -23]`, zoom `4.2`).

#### Animation Hold Period

**File:** `src/components/MapboxMap.tsx` (lines 437-451)

```typescript
// Animation hold: disable landing animations for first 10 seconds
const [landingAnimationsEnabled, setLandingAnimationsEnabled] = useState(
  variant !== 'landing' // animations always on for non-landing variants
)

useEffect(() => {
  if (variant !== 'landing') return
  if (isAuthed) return // Don't enable animations for authenticated users

  const holdMs = 10000 // 10 seconds
  const timer = setTimeout(() => {
    setLandingAnimationsEnabled(true)
  }, holdMs)

  return () => clearTimeout(timer)
}, [variant, isAuthed])
```

**Behavior:** For the first 10 seconds, the map stays static at the SADC viewport. After 10 seconds, `landingAnimationsEnabled` becomes `true`, enabling highlight animations.

#### Geolocation and User Marker

**File:** `src/components/MapboxMap.tsx` (lines 208-319)

When `variant === 'landing'`, in the map `load` event handler:

1. **GeolocateControl added** (lines 216-223):
   ```typescript
   const geolocate = new mapboxgl.GeolocateControl({
     positionOptions: { enableHighAccuracy: true },
     trackUserLocation: true,
     showUserLocation: false, // hide default dot
     showAccuracyCircle: false,
   })
   map.addControl(geolocate, 'top-right')
   ```

2. **User marker created** (lines 226-280):
   - Uses `/assets/character.png` (static import)
   - Stored in `userMarkerRef`
   - "You are here" bubble stored in `youAreHereMarkerRef`
   - Both markers update position on every geolocate event

3. **First geolocation** (lines 284-309):
   ```typescript
   geolocate.on('geolocate', (e: any) => {
     const lng = e.coords.longitude
     const lat = e.coords.latitude
     
     upsertUserMarker(lng, lat)
     
     if (!centeredOnce) {
       centeredOnce = true
       // Only auto-center if fitToMarkers is true (default) or not landing variant
       if (fitToMarkers || variant !== 'landing') {
         map.setCenter([lng, lat])  // Line 300
       }
       setUserLngLat([lng, lat])  // Triggers zoom effect
     }
   })
   ```

   **Note:** Since `fitToMarkers={false}` in `ConvertCashSection`, the map does NOT auto-center on first geolocation. It stays at SADC viewport.

4. **User-centered zoom effect** (lines 771-846):
   ```typescript
   useEffect(() => {
     // ... only runs when userLngLat exists and landingAnimationsEnabled is true
     if (variant === 'landing' && (!landingAnimationsEnabled || isAuthed)) return
     
     // Find nearest branch
     // Calculate zoom to fit user + nearest branch
     // Center stays on user, zoom changes
     
     map.setCenter([userLng, userLat])  // Line 828
     map.easeTo({ zoom: targetZoom, duration: 500 })  // Line 832
   }, [userLngLat, markers, variant, landingAnimationsEnabled, isAuthed])
   ```

   **Behavior:** After 10 seconds (when `landingAnimationsEnabled` becomes true), this effect zooms to fit the user and nearest branch, keeping the user centered.

#### Highlight Animations

**File:** `src/components/MapboxMap.tsx` (lines 671-761)

When a notification highlights a marker:

```typescript
useEffect(() => {
  if (variant === 'popup') return
  if (variant === 'landing' && (!landingAnimationsEnabled || isAuthed)) return
  
  if (highlight) {
    // Save current map state
    savedCenterRef.current = [center.lng, center.lat]
    savedZoomRef.current = zoom
    
    // Lock camera for 5.5 seconds
    cameraLockedUntilRef.current = Date.now() + 5500
    
    // Fly to highlight location
    map.flyTo({  // Line 698
      center: [highlight.lng, highlight.lat],
      zoom: Math.max(zoom, 15),
      duration: 1000,
      essential: true,
    })
    
    // After 3.5s dwell, return to saved position
    setTimeout(() => {
      map.flyTo({  // Line 746
        center: savedCenterRef.current!,
        zoom: savedZoomRef.current!,
        duration: 1000,
      })
    }, 4500)
  }
}, [highlight, variant, landingAnimationsEnabled, isAuthed])
```

**Behavior:** 
- Only runs after 10-second hold period (`landingAnimationsEnabled === true`)
- Only runs when `isAuthed === false`
- Flies to highlighted marker, dwells 3.5s, then returns

---

### Post-Sign-In Map Behavior

#### Auth State Change

**File:** `src/store/auth.ts` (line 51)

When user completes sign-in (password `brics2025`), `completeAuth()` is called:

```typescript
completeAuth: () => {
  stopDemoNotificationEngine()
  clearNotifications()
  set({ isAuthed: true, authOpen: false, ... })
}
```

#### Camera Reset to SADC View

**File:** `src/components/MapboxMap.tsx` (lines 453-471)

```typescript
useEffect(() => {
  const map = mapRef.current
  if (!map || !loadedRef.current) return
  if (variant !== 'landing') return

  if (isAuthed) {
    map.jumpTo({  // Line 461 - NO ANIMATION
      center: SADC_CENTER,  // [30, -23]
      zoom: SADC_ZOOM,  // 4.2
    })
    setLandingAnimationsEnabled(false)  // Disable animations
  }
}, [isAuthed, variant])
```

**Behavior:** When `isAuthed` becomes `true`, the map immediately jumps (no animation) back to the SADC-wide viewport and disables all landing animations.

#### Animation Disabling

**File:** `src/components/MapboxMap.tsx` (lines 680, 771, 846)

All animation effects check `isAuthed`:

```typescript
// Highlight animations
if (variant === 'landing' && (!landingAnimationsEnabled || isAuthed)) return

// User-centered zoom
if (variant === 'landing' && (!landingAnimationsEnabled || isAuthed)) return
```

**Result:** After sign-in, the map becomes completely static:
- No highlight animations
- No user-centered zoom
- No camera movements
- Map stays at SADC viewport

---

### Summary: Landing vs Post-Sign-In

| Aspect | Landing (Pre-Sign-In) | Post-Sign-In |
|--------|----------------------|--------------|
| **Initial viewport** | SADC-wide (`[30, -23]`, zoom `4.2`) | SADC-wide (`[30, -23]`, zoom `4.2`) |
| **First 10 seconds** | Static SADC viewport | Static SADC viewport |
| **After 10 seconds** | Animations enabled | Animations disabled |
| **User marker** | Created from geolocation | Created from geolocation (same) |
| **User-centered zoom** | Enabled (after 10s) | Disabled |
| **Highlight animations** | Enabled (after 10s) | Disabled |
| **Camera movements** | `flyTo`, `easeTo`, `setCenter` | Only `jumpTo` on sign-in, then static |
| **All markers visible** | Yes | Yes (no filtering) |

**Key difference:** Post-sign-in disables all animations and locks the camera to the SADC viewport. The map behavior is identical except animations are disabled.

---

## 2. Markers & Avatars: Exact Implementation

### A) Branch Markers

#### Definition

**File:** `src/components/ConvertCashSection.tsx` (lines 6-28)

```typescript
const sandtonBranch: Marker = {
  id: 'branch-sandton-city',
  lng: 28.054167,
  lat: -26.108333,
  kind: 'branch',
  label: 'Sandton City Branch',
}

const BRANCH_MARKERS: Marker[] = [
  { id: 'branch-1', title: 'Branch 1', coordinates: { lat: -19.77916, lng: 34.87005 } },
  { id: 'branch-2', title: 'Branch 2', coordinates: { lat: -23.85972, lng: 35.34722 } },
  // ... 5 more branches
].map((branch) => ({
  id: branch.id,
  lng: branch.coordinates.lng,
  lat: branch.coordinates.lat,
  kind: 'branch' as const,
  label: branch.title,
}))
```

**Marker type:**
```typescript
export type Marker = {
  id: string
  lng: number
  lat: number
  kind?: 'dealer' | 'branch' | 'member' | 'co_op'
  label?: string
  avatar?: string
  name?: string
}
```

#### Adding Branch Markers to Map

**File:** `src/components/MapboxMap.tsx` (lines 562-567)

```typescript
if (m.kind === 'branch') {
  // Branch marker: default Mapbox pin (blue teardrop)
  marker = new mapboxgl.Marker()
    .setLngLat([m.lng, m.lat])
    .setPopup(new mapboxgl.Popup({ offset: 12 }).setText(m.label ?? m.name ?? ''))
    .addTo(mapRef.current!)
}
```

**Storage:** Stored in `agentMarkersRef.current` with `m.id` as key (line 577).

#### Additional Hardcoded Branch Marker

**File:** `src/components/MapboxMap.tsx` (lines 209-214)

For `variant === 'landing'`, an additional branch marker is added directly in the map `load` handler:

```typescript
if (variant === 'landing') {
  const branchLngLat: [number, number] = [28.054167, -26.108333]
  const branchEl = document.createElement('div')
  branchEl.className = styles.branchMarker  // Custom CSS class
  new mapboxgl.Marker(branchEl).setLngLat(branchLngLat).addTo(map)
}
```

This uses a custom CSS-styled marker (`.branchMarker` class) and is NOT stored in `agentMarkersRef`.

---

### B) Agent Avatars (Demo Agents)

#### Definition

**File:** `src/lib/demo/demoAgents.ts`

```typescript
export type DemoAgent = {
  id: string
  name: string
  handle: string
  avatar: string  // Path to avatar image
  lat: number
  lng: number
}

export const DEMO_AGENTS: DemoAgent[] = [
  {
    id: 'demo-naledi',
    name: 'Naledi',
    handle: '@naledi',
    avatar: '/assets/avatar_agent5.png',
    lat: -26.2041,
    lng: 28.0473, // Johannesburg
  },
  {
    id: 'demo-joao',
    name: 'João',
    handle: '@joao',
    avatar: '/assets/avatar_agent6.png',
    lat: -25.9692,
    lng: 32.5732, // Maputo
  },
  {
    id: 'demo-thabo',
    name: 'Thabo',
    handle: '@thabo',
    avatar: '/assets/avatar_agent7.png',
    lat: -33.9249,
    lng: 18.4241, // Cape Town
  },
  {
    id: 'demo-sarah',
    name: 'Sarah',
    handle: '@sarah',
    avatar: '/assets/avatar_agent8.png',
    lat: -29.8587,
    lng: 31.0218, // Durban
  },
]
```

**Note:** Production only has 4 demo agents with photo avatars. No initial avatars (letters A, C, E, etc.) exist in production.

#### Converting to Markers

**File:** `src/components/MapboxMap.tsx` (lines 94-105)

```typescript
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
```

#### Adding Demo Agents to Map

**File:** `src/components/MapboxMap.tsx` (lines 629-669)

```typescript
useEffect(() => {
  if (!mapRef.current || !loadedRef.current) return
  if (variant === 'popup') return // no demo agents on popup
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== 'true') return
  
  demoAgentMarkers.forEach((agent) => {
    if (agentMarkersRef.current.has(agent.id)) return // Already added
    
    // Create DOM element
    const el = document.createElement('div')
    el.className = 'map-avatar-marker'
    el.style.width = '40px'
    el.style.height = '40px'
    el.style.borderRadius = '50%'
    el.style.overflow = 'hidden'
    el.style.background = '#ffffff'
    el.style.border = 'none'
    el.style.boxShadow = 'none'
    
    // Create image element
    const img = document.createElement('img')
    img.src = agent.avatar || '/assets/avatar_agent5.png'
    img.alt = agent.name || ''
    img.style.width = '100%'
    img.style.height = '100%'
    img.style.objectFit = 'cover'
    img.style.display = 'block'
    el.appendChild(img)
    
    // Create marker
    const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
      .setLngLat([agent.lng, agent.lat])
      .setPopup(new mapboxgl.Popup({ offset: 12 }).setText(agent.name || ''))
      .addTo(mapRef.current!)
    
    // Store in ref
    agentMarkersRef.current.set(agent.id, marker)
  })
}, [demoAgentMarkers, variant])
```

**Key details:**
- Circular avatar: 40x40px, `borderRadius: '50%'`
- White background: `#ffffff`
- Image: `<img>` element with `objectFit: 'cover'`
- No white ring, no z-index manipulation
- Stored in `agentMarkersRef.current` with `agent.id` as key

---

### C) User Marker & "You Are Here" Bubble

#### Geolocation Setup

**File:** `src/components/MapboxMap.tsx` (lines 216-223)

```typescript
const geolocate = new mapboxgl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: true,
  showUserLocation: false, // hide default dot
  showAccuracyCircle: false,
})
map.addControl(geolocate, 'top-right')
```

#### User Marker Creation

**File:** `src/components/MapboxMap.tsx` (lines 226-260)

```typescript
const upsertUserMarker = (lng: number, lat: number) => {
  let el = userMarkerRef.current?.getElement()
  if (!el) {
    // Create DOM element
    el = document.createElement('div')
    el.className = styles.userMarker  // CSS class from module
    
    // Create image element
    const img = document.createElement('img')
    img.className = styles.userImg
    img.alt = 'You are here'
    const userIconUrl = (userIcon as any)?.src ?? '/assets/character.png'
    img.src = userIconUrl
    img.decoding = 'async'
    img.loading = 'eager'
    img.referrerPolicy = 'no-referrer'
    el.appendChild(img)
    
    // Create marker
    userMarkerRef.current = new mapboxgl.Marker({
      element: el,
      anchor: 'center',
    })
      .setLngLat([lng, lat])
      .addTo(map)
  } else {
    // Update position if marker already exists
    userMarkerRef.current!.setLngLat([lng, lat])
  }
  
  // ... "You are here" bubble code below
}
```

**Storage:** Stored in `userMarkerRef` (separate from `agentMarkersRef`).

#### "You Are Here" Bubble

**File:** `src/components/MapboxMap.tsx` (lines 262-279)

```typescript
// Add "You are here" bubble above the user marker
let bubbleEl = youAreHereMarkerRef.current?.getElement()
if (!bubbleEl) {
  bubbleEl = document.createElement('div')
  bubbleEl.style.zIndex = '9999'
  const root = ReactDOM.createRoot(bubbleEl)
  root.render(<YouAreHere />)  // React component
  
  youAreHereMarkerRef.current = new mapboxgl.Marker({
    element: bubbleEl,
    anchor: 'bottom',
    offset: [0, -40], // Position above the avatar PNG
  })
    .setLngLat([lng, lat])
    .addTo(map)
} else {
  youAreHereMarkerRef.current!.setLngLat([lng, lat])
}
```

**Storage:** Stored in `youAreHereMarkerRef` (separate from `agentMarkersRef`).

#### Position Updates

**File:** `src/components/MapboxMap.tsx` (lines 284-309)

```typescript
geolocate.on('geolocate', (e: any) => {
  const lng = e.coords.longitude
  const lat = e.coords.latitude
  
  // Update custom user marker on every geolocate event
  upsertUserMarker(lng, lat)  // Updates both user marker and bubble
  
  // ... rest of handler
})
```

**Behavior:** Both markers update position on every geolocate event.

---

### D) Environment/Config

#### Environment Variables

1. **`NEXT_PUBLIC_DEMO_MODE`**
   - **Required value:** `'true'` (string, not boolean)
   - **Effect:** Enables demo agents to appear on the map
   - **Location:** Checked in `MapboxMap.tsx` lines 95, 633

2. **`NEXT_PUBLIC_MAPBOX_TOKEN`**
   - **Required:** Mapbox access token
   - **Effect:** Used for map initialization and Directions API
   - **Location:** `MapboxMap.tsx` line 174

3. **`NEXT_PUBLIC_DEBUG_MAP`** (optional)
   - **Value:** `'1'` to enable debug logging
   - **Effect:** Enables console logging and debug UI
   - **Location:** `MapboxMap.tsx` lines 43-46

---

## 3. Re-Implementation Recipe

### Step 1: Create Auth Store

**File:** `src/store/auth.ts`

```typescript
import { create } from 'zustand'

interface AuthState {
  isAuthed: boolean
  completeAuth: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthed: false,
  completeAuth: () => {
    set({ isAuthed: true })
  },
}))
```

### Step 2: Create Demo Agents Data

**File:** `src/lib/demo/demoAgents.ts`

```typescript
export type DemoAgent = {
  id: string
  name: string
  handle: string
  avatar: string
  lat: number
  lng: number
}

export const DEMO_AGENTS: DemoAgent[] = [
  {
    id: 'demo-naledi',
    name: 'Naledi',
    handle: '@naledi',
    avatar: '/assets/avatar_agent5.png',
    lat: -26.2041,
    lng: 28.0473,
  },
  // ... add 3 more agents (João, Thabo, Sarah)
]
```

### Step 3: Create Branch Markers Data

**File:** `src/components/ConvertCashSection.tsx` (partial)

```typescript
export type Marker = {
  id: string
  lng: number
  lat: number
  kind?: 'dealer' | 'branch' | 'member' | 'co_op'
  label?: string
  avatar?: string
  name?: string
}

const sandtonBranch: Marker = {
  id: 'branch-sandton-city',
  lng: 28.054167,
  lat: -26.108333,
  kind: 'branch',
  label: 'Sandton City Branch',
}

const BRANCH_MARKERS: Marker[] = [
  { id: 'branch-1', title: 'Branch 1', coordinates: { lat: -19.77916, lng: 34.87005 } },
  // ... add more branches
].map((branch) => ({
  id: branch.id,
  lng: branch.coordinates.lng,
  lat: branch.coordinates.lat,
  kind: 'branch' as const,
  label: branch.title,
}))
```

### Step 4: Create MapboxMap Component

**File:** `src/components/MapboxMap.tsx` (minimal structure)

```typescript
'use client'

import { useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom/client'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { DEMO_AGENTS } from '@/lib/demo/demoAgents'
import YouAreHere from './YouAreHere'
import userIcon from '../../public/assets/character.png'

const SADC_CENTER: [number, number] = [30, -23]
const SADC_ZOOM = 4.2

interface Props {
  containerId?: string
  markers?: Marker[]
  variant?: 'landing' | 'popup'
  isAuthed?: boolean
}

export default function MapboxMap({
  containerId,
  markers = [],
  variant = 'landing',
  isAuthed = false,
}: Props) {
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const loadedRef = useRef(false)
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const youAreHereMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const agentMarkersRef = useRef<Map<string, mapboxgl.Marker>>(new Map())
  const [landingAnimationsEnabled, setLandingAnimationsEnabled] = useState(false)
  const [userLngLat, setUserLngLat] = useState<[number, number] | null>(null)

  // Convert demo agents to markers
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

  // Initialize map
  useEffect(() => {
    const container = containerId ? document.getElementById(containerId) : null
    if (!container || mapRef.current) return

    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

    const map = new mapboxgl.Map({
      container: container,
      style: 'mapbox://styles/mapbox/navigation-day-v1',
      center: SADC_CENTER,
      zoom: SADC_ZOOM,
      attributionControl: false,
      cooperativeGestures: true,
    })

    map.dragRotate.disable()
    map.touchZoomRotate.enable()
    map.touchZoomRotate.disableRotation()

    map.on('load', () => {
      loadedRef.current = true

      if (variant === 'landing') {
        // Add geolocation
        const geolocate = new mapboxgl.GeolocateControl({
          positionOptions: { enableHighAccuracy: true },
          trackUserLocation: true,
          showUserLocation: false,
          showAccuracyCircle: false,
        })
        map.addControl(geolocate, 'top-right')

        // User marker helper
        const upsertUserMarker = (lng: number, lat: number) => {
          let el = userMarkerRef.current?.getElement()
          if (!el) {
            el = document.createElement('div')
            el.className = 'user-marker'
            const img = document.createElement('img')
            img.src = (userIcon as any)?.src ?? '/assets/character.png'
            img.alt = 'You are here'
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

          // "You are here" bubble
          let bubbleEl = youAreHereMarkerRef.current?.getElement()
          if (!bubbleEl) {
            bubbleEl = document.createElement('div')
            bubbleEl.style.zIndex = '9999'
            const root = ReactDOM.createRoot(bubbleEl)
            root.render(<YouAreHere />)
            youAreHereMarkerRef.current = new mapboxgl.Marker({
              element: bubbleEl,
              anchor: 'bottom',
              offset: [0, -40],
            })
              .setLngLat([lng, lat])
              .addTo(map)
          } else {
            youAreHereMarkerRef.current!.setLngLat([lng, lat])
          }
        }

        geolocate.on('geolocate', (e: any) => {
          const lng = e.coords.longitude
          const lat = e.coords.latitude
          upsertUserMarker(lng, lat)
          setUserLngLat([lng, lat])
        })

        setTimeout(() => {
          try {
            geolocate.trigger()
          } catch (err) {
            console.warn('Geolocate trigger failed', err)
          }
        }, 500)
      }
    })

    mapRef.current = map

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
      loadedRef.current = false
    }
  }, [containerId, variant])

  // Enable animations after 10 seconds
  useEffect(() => {
    if (variant !== 'landing' || isAuthed) return
    const timer = setTimeout(() => {
      setLandingAnimationsEnabled(true)
    }, 10000)
    return () => clearTimeout(timer)
  }, [variant, isAuthed])

  // Reset to SADC view on sign-in
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current || variant !== 'landing') return
    if (isAuthed) {
      map.jumpTo({
        center: SADC_CENTER,
        zoom: SADC_ZOOM,
      })
      setLandingAnimationsEnabled(false)
    }
  }, [isAuthed, variant])

  // Add branch markers
  useEffect(() => {
    if (!mapRef.current || !loadedRef.current || !markers) return

    markers.forEach((m) => {
      if (m.kind === 'branch') {
        const marker = new mapboxgl.Marker()
          .setLngLat([m.lng, m.lat])
          .setPopup(new mapboxgl.Popup({ offset: 12 }).setText(m.label ?? ''))
          .addTo(mapRef.current!)
        agentMarkersRef.current.set(m.id, marker)
      }
    })
  }, [markers])

  // Add demo agents
  useEffect(() => {
    if (!mapRef.current || !loadedRef.current) return
    if (variant === 'popup') return
    if (process.env.NEXT_PUBLIC_DEMO_MODE !== 'true') return

    demoAgentMarkers.forEach((agent) => {
      if (agentMarkersRef.current.has(agent.id)) return

      const el = document.createElement('div')
      el.className = 'map-avatar-marker'
      el.style.width = '40px'
      el.style.height = '40px'
      el.style.borderRadius = '50%'
      el.style.overflow = 'hidden'
      el.style.background = '#ffffff'

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
  }, [demoAgentMarkers, variant])

  return null // Map renders into container
}
```

### Step 5: Create ConvertCashSection Component

**File:** `src/components/ConvertCashSection.tsx`

```typescript
import MapboxMap, { type Marker } from './MapboxMap'
import { useAuthStore } from '@/store/auth'

const sandtonBranch: Marker = {
  id: 'branch-sandton-city',
  lng: 28.054167,
  lat: -26.108333,
  kind: 'branch',
  label: 'Sandton City Branch',
}

const BRANCH_MARKERS: Marker[] = [
  // ... define branches
]

const SADC_CENTER: [number, number] = [30, -23]
const SADC_ZOOM = 4.2

export default function ConvertCashSection() {
  const isAuthed = useAuthStore((s) => s.isAuthed)

  return (
    <section>
      <div id="mapbox-container" />
      <MapboxMap
        containerId="mapbox-container"
        markers={[sandtonBranch, ...BRANCH_MARKERS]}
        variant="landing"
        initialCenter={SADC_CENTER}
        initialZoom={SADC_ZOOM}
        fitToMarkers={false}
        isAuthed={isAuthed}
      />
    </section>
  )
}
```

### Step 6: Environment Variables

**File:** `.env.local`

```bash
NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_token_here
NEXT_PUBLIC_DEMO_MODE=true
```

### Step 7: Required Assets

Place these files in `public/assets/`:
- `character.png` (user marker image)
- `avatar_agent5.png`, `avatar_agent6.png`, `avatar_agent7.png`, `avatar_agent8.png` (demo agent avatars)

### Step 8: CSS Classes

**File:** `src/components/MapboxMap.module.css` (minimal)

```css
.userMarker {
  /* Styles for user marker container */
}

.userImg {
  /* Styles for user marker image */
}
```

---

## Summary

**Production behavior:**
1. Map starts at SADC-wide viewport (`[30, -23]`, zoom `4.2`)
2. First 10 seconds: static viewport, no animations
3. After 10 seconds: animations enabled (highlight flyTo, user-centered zoom)
4. Post-sign-in: animations disabled, camera locked to SADC viewport
5. All markers visible at all times (no filtering)
6. Branch markers: default Mapbox pins
7. Demo agents: 4 photo avatars (only if `NEXT_PUBLIC_DEMO_MODE === 'true'`)
8. User marker: created from geolocation, uses `character.png`

**Key files:**
- `src/components/MapboxMap.tsx` - Main map component
- `src/components/ConvertCashSection.tsx` - Map container component
- `src/store/auth.ts` - Auth state management
- `src/lib/demo/demoAgents.ts` - Demo agent definitions

**Key props:**
- `variant="landing"` - Always "landing" in production
- `isAuthed` - Passed from auth store, disables animations when true
- `fitToMarkers={false}` - Prevents auto-centering on first geolocation


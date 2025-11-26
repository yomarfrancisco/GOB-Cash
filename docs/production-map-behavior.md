# Production Map Behavior Documentation

## Overview
This document describes how the production map (main branch) handles markers, avatars, user location, and pre/post-signup behavior.

## 1. Branch Markers

### Definition
**File:** `src/components/ConvertCashSection.tsx` (lines 6-28)

Branch markers are defined as an array of `Marker` objects:

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
  // ... 6 more branches
].map((branch) => ({
  id: branch.id,
  lng: branch.coordinates.lng,
  lat: branch.coordinates.lat,
  kind: 'branch' as const,
  label: branch.title,
}))
```

### Marker Properties
- `id`: Unique identifier (e.g., `'branch-1'`, `'branch-sandton-city'`)
- `lng`: Longitude
- `lat`: Latitude
- `kind`: `'branch'`
- `label`: Display name

### How Branch Markers Are Added
**File:** `src/components/MapboxMap.tsx` (lines 500-593)

Branch markers are passed via `props.markers` and processed in a `useEffect`:

```typescript
useEffect(() => {
  if (!mapRef.current || !isMapLoaded || !markers) return
  
  markers.forEach((m) => {
    // ... other marker types ...
    
    if (m.kind === 'branch') {
      // Branch marker: default Mapbox pin (HQ is handled separately via hqCoord prop)
      marker = new mapboxgl.Marker()
        .setLngLat([m.lng, m.lat])
        .setPopup(new mapboxgl.Popup({ offset: 12 }).setText(m.label ?? m.name ?? ''))
        .addTo(mapRef.current!)
    }
    
    agentMarkersRef.current.set(m.id, marker)
  })
}, [markers, showDebug, isMapLoaded])
```

**Key points:**
- Branch markers use the default Mapbox pin (blue teardrop)
- They are stored in `agentMarkersRef.current` with their `id` as the key
- There's also a hardcoded branch marker added in the map load handler (line 210-214) for landing variant

### Additional Branch Marker (Landing Variant)
**File:** `src/components/MapboxMap.tsx` (lines 208-214)

For landing variant maps, an additional branch marker is added directly in the map load handler:

```typescript
if (variant === 'landing') {
  const branchLngLat: [number, number] = [28.054167, -26.108333]
  const branchEl = document.createElement('div')
  branchEl.className = styles.branchMarker
  new mapboxgl.Marker(branchEl).setLngLat(branchLngLat).addTo(map)
}
```

This uses a custom CSS-styled marker (`.branchMarker` class) and is NOT stored in `agentMarkersRef`.

## 2. Agent Avatars

### Demo Agents Definition
**File:** `src/lib/demo/demoAgents.ts`

Demo agents are defined as:

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
    lng: 28.0473,
  },
  // ... 3 more agents (João, Thabo, Sarah)
]
```

### Photo vs Initial Avatars
**Production does NOT have initial avatars** (no `DEMO_INITIAL_AVATARS`). All demo agents use photo avatars from `/assets/avatar_agent*.png`.

### How Demo Agents Are Added
**File:** `src/components/MapboxMap.tsx` (lines 629-667)

Demo agents are added in a `useEffect` that runs only when:
- `NEXT_PUBLIC_DEMO_MODE === 'true'`
- `variant !== 'popup'`

```typescript
useEffect(() => {
  if (!mapRef.current || !loadedRef.current) return
  if (variant === 'popup') return
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== 'true') return
  
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
}, [demoAgentMarkers, variant])
```

**Key points:**
- Demo agents use circular avatar images (40x40px)
- Images are loaded from `/assets/avatar_agent*.png`
- Markers are stored in `agentMarkersRef.current`
- They persist and are not removed on cleanup

## 3. User Marker / "You Are Here"

### Geolocation Handling
**File:** `src/components/MapboxMap.tsx` (lines 208-310)

Geolocation is handled in the map `load` event handler, only for `variant === 'landing'`:

```typescript
if (variant === 'landing') {
  // Add GeolocateControl
  const geolocate = new mapboxgl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
    showUserLocation: false, // hide default dot
    showAccuracyCircle: false,
  })
  map.addControl(geolocate, 'top-right')
  
  // Helper to create/update user marker
  const upsertUserMarker = (lng: number, lat: number) => {
    // Create user marker element with character.png
    let el = userMarkerRef.current?.getElement()
    if (!el) {
      el = document.createElement('div')
      el.className = styles.userMarker
      const img = document.createElement('img')
      img.className = styles.userImg
      img.alt = 'You are here'
      const userIconUrl = (userIcon as any)?.src ?? '/assets/character.png'
      img.src = userIconUrl
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
    
    // Add "You are here" bubble
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
    // ... auto-center logic ...
  })
}
```

**Key points:**
- User marker uses `/assets/character.png` (static import as `userIcon`)
- Stored in `userMarkerRef` (separate from `agentMarkersRef`)
- "You are here" bubble is a React component rendered via `ReactDOM.createRoot`
- Stored in `youAreHereMarkerRef` (separate from `agentMarkersRef`)
- Only works for `variant === 'landing'`

### Initial Center/Zoom
**File:** `src/components/MapboxMap.tsx` (lines 292-310)

On first geolocation:
- If `fitToMarkers` is true OR `variant !== 'landing'`, the map centers on the user
- Otherwise (landing variant with fixed viewport), it does not auto-center

## 4. Pre-Signup vs Post-Signup

### Auth State Detection
**File:** `src/store/auth.ts`

Auth state is managed via Zustand store:

```typescript
export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthed: false,
  // ...
  completeAuth: () => {
    set({ isAuthed: true, authOpen: false, ... })
  },
}))
```

After entering password `brics2025`, `completeAuth()` sets `isAuthed: true`.

### How Auth State Is Passed to Map
**File:** `src/components/ConvertCashSection.tsx` (lines 38-77)

```typescript
export default function ConvertCashSection({ onHelpClick }: ConvertCashSectionProps) {
  const isAuthed = useAuthStore((s) => s.isAuthed)
  
  return (
    <MapboxMap
      containerId="mapbox-container"
      markers={[sandtonBranch, ...BRANCH_MARKERS]}
      styleUrl="mapbox://styles/mapbox/navigation-day-v1"
      variant="landing"  // Always "landing" in production
      initialCenter={SADC_CENTER}
      initialZoom={SADC_ZOOM}
      fitToMarkers={false}
      isAuthed={isAuthed}  // Passed as prop
    />
  )
}
```

**Key points:**
- `variant` is always `"landing"` in production (hardcoded)
- `isAuthed` is passed as a prop from the auth store
- No `"authed"` variant exists in production

### Map Behavior Differences

**Pre-Signup (`isAuthed: false`):**
- All markers visible (branches, demo agents if `NEXT_PUBLIC_DEMO_MODE === 'true'`)
- Geolocation active (if `variant === 'landing'`)
- User marker appears when location is obtained
- Map shows SADC-wide view (fixed viewport, `fitToMarkers={false}`)

**Post-Signup (`isAuthed: true`):**
- **NO DIFFERENCE** in production - map behavior is identical
- `isAuthed` prop is passed but not used to change map behavior
- All markers still visible
- No visibility filtering
- No pan/zoom restrictions

### Environment Variables

- `NEXT_PUBLIC_DEMO_MODE`: Must be `'true'` for demo agents to appear
- `NEXT_PUBLIC_DEBUG_MAP`: Optional debug flag

## Summary

**Production behavior:**
1. Branch markers: Added via `props.markers`, use default Mapbox pins, stored in `agentMarkersRef`
2. Demo agents: Only 4 photo avatars (Naledi, João, Thabo, Sarah), added when `NEXT_PUBLIC_DEMO_MODE === 'true'`
3. User marker: Created from geolocation, uses `character.png`, stored in separate refs
4. Pre/post-signup: **No difference** - `isAuthed` is passed but doesn't change map behavior
5. No initial avatars, no visibility filtering, no pan/zoom constraints


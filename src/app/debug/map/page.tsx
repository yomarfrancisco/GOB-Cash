'use client'

import { useRef } from 'react'
import MapboxMap, { type Marker } from '@/components/MapboxMap'
import styles from './page.module.css'

const testMarkers: Marker[] = [
  { id: 'dealer-1', lng: 28.0549, lat: -26.1064, kind: 'dealer', label: 'Nearest dealer' },
  { id: 'branch-1', lng: 28.0598, lat: -26.1089, kind: 'branch', label: 'Partner branch' },
]

export default function DebugMapPage() {
  const mapContainerRef = useRef<HTMLDivElement>(null)

  const handleForceResize = () => {
    // Find the mapbox map instance in the DOM and call resize
    const mapboxCanvas = mapContainerRef.current?.querySelector('.mapboxgl-map')
    if (mapboxCanvas) {
      // Access the map instance via the canvas element's parent
      const mapElement = mapboxCanvas as any
      if (mapElement._mapboxglMap) {
        mapElement._mapboxglMap.resize()
        console.log('[Debug] Force resize called')
      } else {
        // Alternative: trigger a window resize event
        window.dispatchEvent(new Event('resize'))
        console.log('[Debug] Dispatched window resize event')
      }
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Mapbox Debug Page</h1>
        <p>Isolated map view for debugging</p>
        <p>Add ?debugMap=1 to URL to see debug logs</p>
        <button onClick={handleForceResize} className={styles.button}>
          Force resize
        </button>
      </div>
      <div ref={mapContainerRef} className={styles.mapWrapper}>
        <MapboxMap
          markers={testMarkers}
          styleUrl="mapbox://styles/mapbox/light-v11"
          showDebug={true}
        />
      </div>
    </div>
  )
}


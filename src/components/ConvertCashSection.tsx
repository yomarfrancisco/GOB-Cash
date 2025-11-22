import Image from 'next/image'
import styles from './ConvertCashSection.module.css'
import MapboxMap, { type Marker } from './MapboxMap'

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
  { id: 'branch-3', title: 'Branch 3', coordinates: { lat: -25.957954, lng: 32.581859 } },
  { id: 'branch-4', title: 'Branch 4', coordinates: { lat: -18.738333, lng: 33.209722 } },
  { id: 'branch-5', title: 'Branch 5', coordinates: { lat: -25.964028, lng: 32.572472 } },
  { id: 'branch-6', title: 'Branch 6', coordinates: { lat: -25.94322, lng: 32.55822 } },
  { id: 'branch-7', title: 'Branch 7', coordinates: { lat: -25.97107, lng: 32.57202 } },
].map((branch) => ({
  id: branch.id,
  lng: branch.coordinates.lng,
  lat: branch.coordinates.lat,
  kind: 'branch' as const,
  label: branch.title,
}))

type ConvertCashSectionProps = {
  onHelpClick?: () => void
}

export default function ConvertCashSection({ onHelpClick }: ConvertCashSectionProps) {
  return (
    <section className={`sectionShell ${styles.mapSectionShell}`} aria-labelledby="convert-title">
      <div className={styles.mapHeader}>
        <div className={styles.headerRow}>
          <h2 id="convert-title" className={styles.mapHeaderTitle}>
            Convert cash to crypto
          </h2>
          <button 
            className={styles.helpBtn} 
            aria-label="Help"
            onClick={onHelpClick}
            type="button"
          >
            ?
          </button>
        </div>
        <p className={styles.mapHeaderSub}>
          Convert hard cash into USDT directly from verified agents.
        </p>
      </div>

      <div className={styles.mapContainer}>
        <div className={styles.mapCard}>
          {/* Empty map container - Mapbox will attach here */}
          <div className={styles.mapInnerContainer} id="mapbox-container" />
          
          {/* Live map component - renders into mapContainer */}
          <MapboxMap
            containerId="mapbox-container"
            markers={[sandtonBranch, ...BRANCH_MARKERS]}
            styleUrl="mapbox://styles/mapbox/navigation-day-v1"
            variant="landing"
          />

          {/* Paper/fold overlays as siblings, not children of map container */}
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
    </section>
  )
}


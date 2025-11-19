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

export default function ConvertCashSection() {
  return (
    <section className={`sectionShell ${styles.mapSectionShell}`} aria-labelledby="convert-title">
      <div className={styles.mapHeader}>
        <div className={styles.headerRow}>
          <h2 id="convert-title" className={styles.mapHeaderTitle}>
            Stokvels around you
          </h2>
          <button className={styles.helpBtn} aria-label="Help">
            ?
          </button>
        </div>
        <p className={styles.mapHeaderSub}>
          Join a group saving toward a shared goal — or start your own.
        </p>
      </div>

      <div className={styles.mapContainer}>
        <div className={styles.mapCard}>
          {/* Empty map container - Mapbox will attach here */}
          <div className={styles.mapInnerContainer} id="mapbox-container" />
          
          {/* Live map component - renders into mapContainer */}
          <MapboxMap
            containerId="mapbox-container"
            markers={[sandtonBranch]}
            styleUrl="mapbox://styles/mapbox/streets-v12"
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


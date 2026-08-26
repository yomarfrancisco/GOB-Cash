'use client'

import Image from 'next/image'
import styles from './SplashScreenOverlay.module.css'

export default function SplashScreenOverlay() {
  return (
    <div className={styles.wrap} aria-hidden>
      <div className={styles.logoWrapper}>
        <Image
          src="/assets/MoZ-logo.png"
          alt="MoZ"
          fill
          style={{ objectFit: 'contain' }}
          priority
          sizes="(max-width: 600px) 50vw, 149px"
        />
      </div>
    </div>
  )
}


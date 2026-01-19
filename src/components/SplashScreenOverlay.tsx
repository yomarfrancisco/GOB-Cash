'use client'

import Image from 'next/image'
import styles from './SplashScreenOverlay.module.css'

export default function SplashScreenOverlay() {
  return (
    <div className={styles.wrap} aria-hidden>
      <div className={styles.logoWrapper}>
        <Image
          src="/assets/core/Go_B logo.png"
          alt="GoBankless"
          fill
          style={{ objectFit: 'contain' }}
          priority
          sizes="(max-width: 600px) 40vw, 119px"
        />
      </div>
    </div>
  )
}


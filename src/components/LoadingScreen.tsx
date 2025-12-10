'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import styles from './LoadingScreen.module.css'

export default function LoadingScreen() {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setHidden(true), 3500) // start fade after 3.5s
    return () => clearTimeout(t)
  }, [])

  return (
    <div className={styles.splash} aria-hidden={hidden ? 'true' : 'false'}>
      <div className={styles.logoWrapper}>
        <Image
          src="/assets/core/gobankless-logo.png"
          alt="GoBankless"
          fill
          style={{ objectFit: 'contain' }} /* keep ratio; only splash size changes */
          priority
          sizes="(max-width: 600px) 80vw, 238px"
        />
      </div>
    </div>
  )
}


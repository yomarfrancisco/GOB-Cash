'use client'

import Image from 'next/image'
import styles from './TransferCardsIcon.module.css'

export default function TransferCardsIcon() {
  return (
    <div className={styles.stack}>
      {/* Back card (ZAR) */}
      <div className={styles.cardBack}>
        <Image
          src="/assets/cards/card-savings.jpg"
          alt=""
          width={44}
          height={28}
          className={styles.cardImage}
        />
      </div>
      {/* Front card (Pepe) */}
      <div className={styles.cardFront}>
        <Image
          src="/assets/cards/card-pepe.jpg"
          alt=""
          width={44}
          height={28}
          className={styles.cardImage}
        />
      </div>
    </div>
  )
}


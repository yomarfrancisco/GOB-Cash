import Image from 'next/image'
import type { CardBrand } from '@/store/userProfile'
import styles from './CardBrandIcon.module.css'

const BRAND_SRC: Record<CardBrand, string> = {
  visa: '/assets/visa.png',
  mastercard: '/assets/mastercard.png',
  amex: '/assets/amex.png',
}

interface CardBrandIconProps {
  brand: CardBrand
}

export function CardBrandIcon({ brand }: CardBrandIconProps) {
  return (
    <div className={styles.cardBrandIcon}>
      <Image
        src={BRAND_SRC[brand]}
        alt={brand}
        width={32}
        height={20}
        className={styles.cardBrandImage}
      />
    </div>
  )
}


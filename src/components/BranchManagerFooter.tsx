'use client'

import Image from 'next/image'
import styles from './BranchManagerFooter.module.css'

type BranchManagerFooterProps = {
  onWhatsAppClick?: () => void
}

export default function BranchManagerFooter({ onWhatsAppClick }: BranchManagerFooterProps) {
  const handleFooterClick = () => {
    if (onWhatsAppClick) {
      onWhatsAppClick()
    } else if (typeof window !== 'undefined') {
      window.open('https://wa.me/27823306256', '_blank')
    }
  }

  return (
    <div
      className={styles.footer}
      role="button"
      onClick={handleFooterClick}
      aria-label="Talk to an agent"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleFooterClick()
        }
      }}
    >
      <div className={styles.leftSection}>
        <div className={styles.avatarsWrapper}>
          <div className={`${styles.avatarContainer} ${styles.avatar1}`}>
            <Image
              src="/assets/avatar_agent1.png"
              alt="Agent 1"
              width={31}
              height={31}
              className={styles.avatar}
            />
          </div>
          <div className={`${styles.avatarContainer} ${styles.avatar2}`}>
            <Image
              src="/assets/avatar_agent2.png"
              alt="Agent 2"
              width={31}
              height={31}
              className={styles.avatar}
            />
          </div>
          <div className={`${styles.avatarContainer} ${styles.avatar3}`}>
            <Image
              src="/assets/avatar_agent3.png"
              alt="Agent 3"
              width={31}
              height={31}
              className={styles.avatar}
            />
          </div>
          <div className={`${styles.avatarContainer} ${styles.avatar4}`}>
            <Image
              src="/assets/avatar_agent4.png"
              alt="Agent 4"
              width={31}
              height={31}
              className={styles.avatar}
            />
          </div>
        </div>
        <div className={styles.textContainer}>
          <span className={styles.count}>4</span>
          <span className={styles.label}>active Stokvels nearby</span>
        </div>
      </div>
      <div className={styles.whatsappIconWrapper}>
        <Image
          src="/assets/WhatsApp_Balck.png"
          alt="WhatsApp"
          width={27}
          height={27}
          className={styles.whatsappIcon}
        />
      </div>
    </div>
  )
}


'use client'

import Image from 'next/image'
import styles from '../ConvertCashSection.module.css'
import React from 'react'

type CardShellProps = {
  headerAvatarSrc?: string
  headerAvatarAlt?: string
  headerTitle: string
  headerSubtitle: string
  children: React.ReactNode
  footerAvatars?: { src: string; alt: string }[]
  footerCtaLabel?: string
  onFooterCtaClick?: () => void
}

const DEFAULT_AVATARS: { src: string; alt: string }[] = [
  { src: '/assets/avatar_agent5.png', alt: 'Agent 1' },
  { src: '/assets/avatar_agent6.png', alt: 'Agent 2' },
  { src: '/assets/avatar_agent7.png', alt: 'Agent 3' },
]

export function CardShell({
  headerAvatarSrc,
  headerAvatarAlt,
  headerTitle,
  headerSubtitle,
  children,
  footerAvatars = DEFAULT_AVATARS,
  footerCtaLabel = 'Talk to agents',
  onFooterCtaClick,
}: CardShellProps) {
  return (
    <div className={styles.mapCard}>
      {/* Header inside card */}
      <div className={styles.cardHeader}>
        {headerAvatarSrc ? (
          <div className={styles.cardHeaderAvatar}>
            <Image src={headerAvatarSrc} alt={headerAvatarAlt || headerTitle} fill className={styles.cardHeaderAvatarImg} />
          </div>
        ) : null}
        <div className={styles.cardHeaderText}>
          <div className={styles.cardHeaderTitle}>{headerTitle}</div>
          <div className={styles.cardHeaderSubtitle}>{headerSubtitle}</div>
        </div>
      </div>

      {/* Body */}
      <div className={styles.cardBody}>{children}</div>

      {/* Footer */}
      <div className={styles.cardFooter}>
        <div className={styles.avatarStack}>
          {footerAvatars.map((a, idx) => (
            <div key={idx} className={styles.avatarBubble}>
              <Image src={a.src} alt={a.alt} width={28} height={28} className={styles.avatarImg} />
            </div>
          ))}
        </div>
        <button
          type="button"
          className={styles.footerCta}
          onClick={onFooterCtaClick}
        >
          {footerCtaLabel}
        </button>
      </div>
    </div>
  )
}


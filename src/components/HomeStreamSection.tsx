'use client'

import Image from 'next/image'
import styles from './HomeStreamSection.module.css'
import sharedStyles from './ConvertCashSection.module.css'

type StreamItemData = {
  id: string
  avatarSrc: string
  avatarAlt: string
  title: string
  subtitle: string
  bodyTitle: string
  bodySubtitle: string
  footerAvatars: { src: string; alt: string }[]
  footerCount: number
  footerLabel: string
  footerIconSrc?: string
}

const STREAM_ITEMS: StreamItemData[] = [
  {
    id: 'jhb-cbd',
    avatarSrc: '/assets/Brics-girl-blue.png',
    avatarAlt: 'Johannesburg CBD hub',
    title: 'Johannesburg CBD cash hub',
    subtitle: 'SADC corridor • South Africa • GMT+2',
    bodyTitle: 'R10k – R100k deposits',
    bodySubtitle: 'Swap cash for USDT with verified agents in your area.',
    footerAvatars: [
      { src: '/assets/avatar_agent5.png', alt: 'Agent 1' },
      { src: '/assets/avatar_agent6.png', alt: 'Agent 2' },
      { src: '/assets/avatar_agent7.png', alt: 'Agent 3' },
    ],
    footerCount: 4,
    footerLabel: 'agents nearby',
    footerIconSrc: '/assets/Social=WhatsApp,Style=Original.svg',
  },
  {
    id: 'cpt-hub',
    avatarSrc: '/assets/avatar-ariel.png',
    avatarAlt: 'Cape Town hub',
    title: 'Cape Town international hub',
    subtitle: 'International corridor • South Africa • GMT+2',
    bodyTitle: 'Cross-border cash-in / cash-out',
    bodySubtitle: 'Serve friends in UK / EU / USA with fast settlement.',
    footerAvatars: [
      { src: '/assets/avatar_agent6.png', alt: 'Agent 1' },
      { src: '/assets/avatar_agent7.png', alt: 'Agent 2' },
    ],
    footerCount: 3,
    footerLabel: 'agents nearby',
    footerIconSrc: '/assets/Social=WhatsApp,Style=Original.svg',
  },
  {
    id: 'dbn-hub',
    avatarSrc: '/assets/avatar_agent5.png',
    avatarAlt: 'Durban hub',
    title: 'Durban cash corridor',
    subtitle: 'SADC corridor • South Africa • GMT+2',
    bodyTitle: 'Cash pickup & delivery',
    bodySubtitle: 'Trusted couriers for deposits and withdrawals.',
    footerAvatars: [
      { src: '/assets/avatar_agent8.png', alt: 'Agent 1' },
      { src: '/assets/avatar_agent5.png', alt: 'Agent 2' },
      { src: '/assets/avatar_agent6.png', alt: 'Agent 3' },
    ],
    footerCount: 5,
    footerLabel: 'agents nearby',
    footerIconSrc: '/assets/Social=WhatsApp,Style=Original.svg',
  },
  {
    id: 'gab-hub',
    avatarSrc: '/assets/avatar_agent8.png',
    avatarAlt: 'Gaborone hub',
    title: 'Gaborone community float',
    subtitle: 'Local corridor • Botswana • GMT+2',
    bodyTitle: 'Community float circle',
    bodySubtitle: 'Join a local float to serve nearby customers.',
    footerAvatars: [
      { src: '/assets/avatar_agent7.png', alt: 'Agent 1' },
      { src: '/assets/avatar_agent8.png', alt: 'Agent 2' },
    ],
    footerCount: 2,
    footerLabel: 'agents nearby',
    footerIconSrc: '/assets/Social=WhatsApp,Style=Original.svg',
  },
]

type StreamItemProps = {
  item: StreamItemData
  onItemClick?: (itemId: string) => void
}

function StreamItem({ item, onItemClick }: StreamItemProps) {
  return (
    <div className={styles.streamItem}>
      {/* 1) Content header - avatar + title + subtitle (outside card) */}
      <div className={styles.streamHeader}>
        <div className={styles.streamHeaderAvatar}>
          <Image
            src={item.avatarSrc}
            alt={item.avatarAlt}
            fill
            className={styles.streamHeaderAvatarImg}
          />
        </div>
        <div className={styles.streamHeaderText}>
          <div className={styles.streamHeaderTitle}>{item.title}</div>
          <div className={styles.streamHeaderSubtitle}>{item.subtitle}</div>
        </div>
      </div>

      {/* 2) Content card - beige box matching map card dimensions */}
      <div className={styles.streamCardContainer}>
        <div className={styles.streamCard}>
          <div className={styles.streamCardContent}>
            <div className={styles.streamCardTitle}>{item.bodyTitle}</div>
            <div className={styles.streamCardSubtitle}>{item.bodySubtitle}</div>
          </div>
        </div>
      </div>

      {/* 3) Content footer - avatars + label + icon (outside card) */}
      <div className={styles.streamFooter} onClick={() => onItemClick?.(item.id)}>
        <div className={styles.streamFooterLeft}>
          <div className={styles.streamFooterAvatars}>
            {item.footerAvatars.map((avatar, idx) => (
              <div key={idx} className={styles.streamFooterAvatarContainer}>
                <Image
                  src={avatar.src}
                  alt={avatar.alt}
                  width={31}
                  height={31}
                  className={styles.streamFooterAvatar}
                />
              </div>
            ))}
          </div>
          <div className={styles.streamFooterText}>
            <span className={styles.streamFooterCount}>{item.footerCount}</span>
            <span className={styles.streamFooterLabel}>{item.footerLabel}</span>
          </div>
        </div>
        {item.footerIconSrc && (
          <div className={styles.streamFooterRight}>
            <Image
              src={item.footerIconSrc}
              alt=""
              width={27}
              height={27}
              className={styles.streamFooterIcon}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default function HomeStreamSection() {
  const handleItemClick = (itemId: string) => {
    // Placeholder - will wire real navigation later
    console.log('[HomeStreamSection] Item clicked:', itemId)
  }

  return (
    <section className={`sectionShell ${sharedStyles.mapSectionShell} ${sharedStyles.streamSectionSpacing}`} aria-labelledby="stream-title">
      <div className={sharedStyles.streamSectionSpacer} />
      <div className={sharedStyles.mapHeader}>
        <div className={sharedStyles.headerRow}>
          <h2 id="stream-title" className={sharedStyles.mapHeaderTitle}>
            Become an agent
          </h2>
        </div>
        <p className={sharedStyles.mapHeaderSub}>
          Show up and earn
        </p>
      </div>

      {/* Stream items feed */}
      {STREAM_ITEMS.map((item) => (
        <StreamItem
          key={item.id}
          item={item}
          onItemClick={handleItemClick}
        />
      ))}
    </section>
  )
}

'use client'

import Image from 'next/image'
import { SmartphoneNfc, Tag, Clock3, BadgeDollarSign, Info } from 'lucide-react'
import styles from './HomeStreamSection.module.css'
import sharedStyles from './ConvertCashSection.module.css'
import { useAuthStore } from '@/store/auth'

type StreamItemData = {
  id: string
  avatarSrc: string
  avatarAlt: string
  title: string
  subtitle: string
  bodyTitle: string
  bodySubtitle: string
  posterSrc: string
  footerAvatars: { src: string; alt: string }[]
  footerCount: number
  footerLabel: string
  footerIconSrc?: string
  industryTag: string
  showUpTag: string
  commissionTag: string
}

const STREAM_ITEMS: StreamItemData[] = [
  {
    id: 'starbucks',
    avatarSrc: '/assets/Starbucks.png',
    avatarAlt: 'Starbucks',
    title: 'Starbucks',
    subtitle: 'Johannesburg, South Africa',
    bodyTitle: 'R10k – R100k deposits',
    bodySubtitle: 'Swap cash for USDT with verified agents in your area.',
    posterSrc: '/assets/starbucks_poster.png',
    footerAvatars: [
      { src: '/assets/avatar_agent5.png', alt: 'Agent 1' },
      { src: '/assets/avatar_agent6.png', alt: 'Agent 2' },
      { src: '/assets/avatar_agent7.png', alt: 'Agent 3' },
    ],
    footerCount: 4,
    footerLabel: 'agents nearby',
    footerIconSrc: '/assets/Social=WhatsApp,Style=Original.svg',
    industryTag: 'coffee',
    showUpTag: 'R70/hr show-up',
    commissionTag: '12% commission',
  },
  {
    id: 'edgars',
    avatarSrc: '/assets/Edgars.png',
    avatarAlt: 'Edgars',
    title: 'Edgars',
    subtitle: 'Johannesburg, South Africa',
    bodyTitle: 'Cross-border cash-in / cash-out',
    bodySubtitle: 'Serve friends in UK / EU / USA with fast settlement.',
    posterSrc: '/assets/Edgars_poster.png',
    footerAvatars: [
      { src: '/assets/avatar_agent6.png', alt: 'Agent 1' },
      { src: '/assets/avatar_agent7.png', alt: 'Agent 2' },
    ],
    footerCount: 3,
    footerLabel: 'agents nearby',
    footerIconSrc: '/assets/Social=WhatsApp,Style=Original.svg',
    industryTag: 'beauty',
    showUpTag: 'R85/hr show-up',
    commissionTag: '15% commission',
  },
  {
    id: 'sportscene',
    avatarSrc: '/assets/Sportscene.png',
    avatarAlt: 'Sportscene',
    title: 'Sportscene',
    subtitle: 'Johannesburg, South Africa',
    bodyTitle: 'Cash pickup & delivery',
    bodySubtitle: 'Trusted couriers for deposits and withdrawals.',
    posterSrc: '/assets/Sportscene_poster.png',
    footerAvatars: [
      { src: '/assets/avatar_agent8.png', alt: 'Agent 1' },
      { src: '/assets/avatar_agent5.png', alt: 'Agent 2' },
      { src: '/assets/avatar_agent6.png', alt: 'Agent 3' },
    ],
    footerCount: 5,
    footerLabel: 'agents nearby',
    footerIconSrc: '/assets/Social=WhatsApp,Style=Original.svg',
    industryTag: 'fashion',
    showUpTag: 'R90/hr show-up',
    commissionTag: '18% commission',
  },
  {
    id: 'opera',
    avatarSrc: '/assets/Opera.png',
    avatarAlt: 'Opera',
    title: 'Opera',
    subtitle: 'Johannesburg, South Africa',
    bodyTitle: 'Community float circle',
    bodySubtitle: 'Join a local float to serve nearby customers.',
    posterSrc: '/assets/Opera_poster.png',
    footerAvatars: [
      { src: '/assets/avatar_agent7.png', alt: 'Agent 1' },
      { src: '/assets/avatar_agent8.png', alt: 'Agent 2' },
    ],
    footerCount: 2,
    footerLabel: 'agents nearby',
    footerIconSrc: '/assets/Social=WhatsApp,Style=Original.svg',
    industryTag: 'delivery',
    showUpTag: 'R75/hr show-up',
    commissionTag: '10% commission',
  },
]

type StreamItemProps = {
  item: StreamItemData
  onItemClick?: (itemId: string) => void
}

function StreamItem({ item, onItemClick }: StreamItemProps) {
  const { openAuthEntrySignup } = useAuthStore()

  const handleCommercialClick = (itemId: string) => {
    // Open sign-up popup for all Section 3 interactions
    openAuthEntrySignup()
  }

  return (
    <div className={styles.streamItem}>
      {/* 1) Content header - avatar + title + subtitle (outside card) */}
      <div className={styles.streamHeader}>
        <div className={styles.streamHeaderLeft}>
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
      </div>

      {/* 2) Content card - beige box matching map card dimensions */}
      <div className={styles.streamCardContainer}>
        <div 
          className={styles.streamCard}
          onClick={() => handleCommercialClick(item.id)}
          style={{ cursor: 'pointer' }}
        >
          {/* Tag row overlay - positioned at top-left */}
          <div className={styles.tagRowOverlay}>
            <div className={`${styles.tagPill} ${styles.industryTag}`}>
              <Tag className={styles.tagIcon} />
              <span className={styles.tagLabel}>{item.industryTag}</span>
            </div>
            <div className={`${styles.tagPill} ${styles.showUpTag}`}>
              <Clock3 className={styles.tagIcon} />
              <span className={styles.tagLabel}>{item.showUpTag}</span>
            </div>
            <div className={`${styles.tagPill} ${styles.commissionTag}`}>
              <BadgeDollarSign className={styles.tagIcon} />
              <span className={styles.tagLabel}>{item.commissionTag}</span>
            </div>
          </div>
          {/* Poster image - fills card with rounded corners */}
          <Image
            src={item.posterSrc}
            alt={item.avatarAlt}
            fill
            className={styles.streamCardPoster}
            priority
          />
        </div>
      </div>

      {/* 3) Content footer - avatars + label + icon (outside card) */}
      <div className={styles.streamFooter}>
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
          <button
            type="button"
            className={styles.streamFooterText}
            onClick={() => handleCommercialClick(item.id)}
          >
            <span className={styles.streamFooterLabel}>Clock-in for work</span>
          </button>
        </div>
        <div className={styles.streamFooterRight}>
          <Info 
            size={27} 
            className={styles.streamFooterIcon}
            onClick={() => handleCommercialClick(item.id)}
            style={{ cursor: 'pointer' }}
          />
          <SmartphoneNfc 
            size={27} 
            className={styles.streamFooterIcon}
            onClick={() => handleCommercialClick(item.id)}
            style={{ cursor: 'pointer' }}
          />
        </div>
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
            Become a cash agent
          </h2>
        </div>
        <p className={sharedStyles.mapHeaderSub}>
          Explore opportunities. Show up. Earn
        </p>
      </div>

      {/* Stream items feed */}
      <div className={styles.streamFeedWrapper}>
        {STREAM_ITEMS.map((item) => (
          <StreamItem
            key={item.id}
            item={item}
            onItemClick={handleItemClick}
          />
        ))}
      </div>
    </section>
  )
}

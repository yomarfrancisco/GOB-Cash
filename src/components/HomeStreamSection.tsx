'use client'

import Image from 'next/image'
import { SmartphoneNfc, Tag, Clock3, BadgeDollarSign, Info } from 'lucide-react'
import styles from './HomeStreamSection.module.css'
import sharedStyles from './ConvertCashSection.module.css'
import { useAuthStore } from '@/store/auth'

// Commercial agent avatar pool - includes original 5-8 plus new 13-15
const COMMERCIAL_AGENT_AVATARS = [
  '/assets/avatar_agent5.png',
  '/assets/avatar_agent6.png',
  '/assets/avatar_agent7.png',
  '/assets/avatar_agent8.png',
  '/assets/avatar_agent13.png',
  '/assets/avatar_agent14.png',
  '/assets/avatar_agent15.png',
]

// Helper to get avatars for a commercial card deterministically based on card index
// Enforces a hard cap of 4 avatars max for commercial content footers
const MAX_FOOTER_AVATARS = 4
const getFooterAvatars = (cardIndex: number, count: number): { src: string; alt: string }[] => {
  // Cap count at 4 avatars max
  const cappedCount = Math.min(count, MAX_FOOTER_AVATARS)
  
  // Log truncation in dev mode
  if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production' && count > MAX_FOOTER_AVATARS) {
    console.debug('[AvatarStack] Truncating avatars', { original: count, shown: MAX_FOOTER_AVATARS })
  }
  
  const avatars: { src: string; alt: string }[] = []
  for (let i = 0; i < cappedCount; i++) {
    const avatarIndex = (cardIndex * 2 + i) % COMMERCIAL_AGENT_AVATARS.length
    avatars.push({
      src: COMMERCIAL_AGENT_AVATARS[avatarIndex],
      alt: `Agent ${i + 1}`,
    })
  }
  return avatars
}

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

// Generate stream items with deterministic avatar selection
const generateStreamItems = (): StreamItemData[] => {
  const baseItems = [
    {
      id: 'starbucks',
      avatarSrc: '/assets/Starbucks.png',
      avatarAlt: 'Starbucks',
      title: 'Starbucks',
      subtitle: 'Johannesburg, South Africa',
      bodyTitle: 'R10k – R100k deposits',
      bodySubtitle: 'Swap cash for USDT with verified agents in your area.',
      posterSrc: '/assets/starbucks_poster.png',
      footerCount: 4,
      footerLabel: 'agents nearby',
      footerIconSrc: '/assets/Social=WhatsApp,Style=Original.svg',
      industryTag: 'coffee',
      showUpTag: 'R70/hr show-up',
      commissionTag: '12% commission',
    },
    {
      id: 'medicross',
      avatarSrc: '/assets/medicross-logo.png',
      avatarAlt: 'MediCross',
      title: 'MediCross',
      subtitle: 'Johannesburg, South Africa',
      bodyTitle: 'Cross-border cash-in / cash-out',
      bodySubtitle: 'Serve friends in UK / EU / USA with fast settlement.',
      posterSrc: '/assets/commercial_hospital.jpg',
      footerCount: 3,
      footerLabel: 'agents nearby',
      footerIconSrc: '/assets/Social=WhatsApp,Style=Original.svg',
      industryTag: 'health',
      showUpTag: 'R85/hr show-up',
      commissionTag: '15% commission',
    },
    {
      id: 'or-tambo',
      avatarSrc: '/assets/acsa-logo.png',
      avatarAlt: 'O. R. Tambo Int',
      title: 'O. R. Tambo Int',
      subtitle: 'Johannesburg, South Africa',
      bodyTitle: 'Cash pickup & delivery',
      bodySubtitle: 'Trusted couriers for deposits and withdrawals.',
      posterSrc: '/assets/commercial_airport.jpg',
      footerCount: 5,
      footerLabel: 'agents nearby',
      footerIconSrc: '/assets/Social=WhatsApp,Style=Original.svg',
      industryTag: 'travel',
      showUpTag: 'R90/hr show-up',
      commissionTag: '18% commission',
    },
    {
      id: 'ekurhuleni',
      avatarSrc: '/assets/Ekurhuleni-logo.png',
      avatarAlt: 'Ekurhuleni',
      title: 'Ekurhuleni',
      subtitle: 'Johannesburg, South Africa',
      bodyTitle: 'Community float circle',
      bodySubtitle: 'Join a local float to serve nearby customers.',
      posterSrc: '/assets/commercial_taxi.jpg',
      footerCount: 2,
      footerLabel: 'agents nearby',
      footerIconSrc: '/assets/Social=WhatsApp,Style=Original.svg',
      industryTag: 'mobility',
      showUpTag: 'R75/hr show-up',
      commissionTag: '10% commission',
    },
    {
      id: 'wits',
      avatarSrc: '/assets/Wits-logo-text.jpg',
      avatarAlt: 'Wits University',
      title: 'Wits University',
      subtitle: 'Johannesburg, South Africa',
      bodyTitle: 'R10k – R100k deposits',
      bodySubtitle: 'Swap cash for USDT with verified agents in your area.',
      posterSrc: '/assets/commercial-wits2.jpg',
      footerCount: 4,
      footerLabel: 'agents nearby',
      footerIconSrc: '/assets/Social=WhatsApp,Style=Original.svg',
      industryTag: 'education',
      showUpTag: 'R120/hr show-up',
      commissionTag: '12% commission',
    },
    {
      id: 'mall-of-africa',
      avatarSrc: '/assets/mall-of-africa-logo2.png',
      avatarAlt: 'Mall of Africa',
      title: 'Mall of Africa',
      subtitle: 'Johannesburg, South Africa',
      bodyTitle: 'Cross-border cash-in / cash-out',
      bodySubtitle: 'Serve friends in UK / EU / USA with fast settlement.',
      posterSrc: '/assets/commercial_mallofAfrica.jpg',
      footerCount: 3,
      footerLabel: 'agents nearby',
      footerIconSrc: '/assets/Social=WhatsApp,Style=Original.svg',
      industryTag: 'retail',
      showUpTag: 'R90/hr show-up',
      commissionTag: '10% commission',
    },
    {
      id: 'mcdonalds',
      avatarSrc: '/assets/McD-logo.png',
      avatarAlt: "McDonald's",
      title: "McDonald's",
      subtitle: 'Johannesburg, South Africa',
      bodyTitle: 'R10k – R100k deposits',
      bodySubtitle: 'Swap cash for USDT with verified agents in your area.',
      posterSrc: '/assets/Commercial_McDonalds.png',
      footerCount: 4,
      footerLabel: 'agents nearby',
      footerIconSrc: '/assets/Social=WhatsApp,Style=Original.svg',
      industryTag: 'food',
      showUpTag: 'R85/hr show-up',
      commissionTag: '9% commission',
    },
    {
      id: 'shell-fuel',
      avatarSrc: '/assets/Shell-logo.png',
      avatarAlt: 'Shell Fuel Station',
      title: 'Shell Fuel Station',
      subtitle: 'Johannesburg, South Africa',
      bodyTitle: 'Cross-border cash-in / cash-out',
      bodySubtitle: 'Serve friends in UK / EU / USA with fast settlement.',
      posterSrc: '/assets/commercial-shell-gas.jpg',
      footerCount: 3,
      footerLabel: 'agents nearby',
      footerIconSrc: '/assets/Social=WhatsApp,Style=Original.svg',
      industryTag: 'fuel',
      showUpTag: 'R80/hr show-up',
      commissionTag: '8% commission',
    },
  ]

  return baseItems.map((item, index) => ({
    ...item,
    footerAvatars: getFooterAvatars(index, item.footerCount),
  }))
}

const STREAM_ITEMS: StreamItemData[] = generateStreamItems()

type StreamItemProps = {
  item: StreamItemData
}

function StreamItem({ item }: StreamItemProps) {
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
            {item.footerAvatars.slice(0, MAX_FOOTER_AVATARS).map((avatar, idx) => (
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
          />
        ))}
      </div>
    </section>
  )
}

'use client'

import Image from 'next/image'
import styles from './ConvertCashSection.module.css'
import { CardShell } from './home/CardShell'

const STREAM_POSTS = [
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
    footerCtaLabel: 'View hub',
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
    footerCtaLabel: 'Join stream',
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
    footerCtaLabel: 'Open',
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
    footerCtaLabel: 'View hub',
  },
]

export default function HomeStreamSection() {
  const handleCardClick = (postId: string) => {
    // Placeholder - will wire real navigation later
    console.log('[HomeStreamSection] Card clicked:', postId)
  }

  return (
    <section className={`sectionShell ${styles.mapSectionShell} ${styles.streamSectionSpacing}`} aria-labelledby="stream-title">
      <div className={styles.streamSectionSpacer} />
      <div className={styles.mapHeader}>
        <div className={styles.headerRow}>
          <h2 id="stream-title" className={styles.mapHeaderTitle}>
            Become an agent
          </h2>
        </div>
        <p className={styles.mapHeaderSub}>
          Show up and earn
        </p>
      </div>

      <div className={styles.streamCardsContainer}>
        {STREAM_POSTS.map((post) => (
          <div key={post.id} className={styles.streamCardWrapper}>
            <CardShell
              headerAvatarSrc={post.avatarSrc}
              headerAvatarAlt={post.avatarAlt}
              headerTitle={post.title}
              headerSubtitle={post.subtitle}
              footerAvatars={post.footerAvatars}
              footerCtaLabel={post.footerCtaLabel}
              onFooterCtaClick={() => {
                handleCardClick(post.id)
              }}
            >
              {/* Post body - neutral gradient placeholder matching map card dimensions */}
              <div className={styles.streamCardBody}>
                <div className={styles.streamCardContent}>
                  <div className={styles.streamCardTitle}>{post.bodyTitle}</div>
                  <div className={styles.streamCardSubtitle}>{post.bodySubtitle}</div>
                </div>
              </div>
            </CardShell>
          </div>
        ))}
      </div>
    </section>
  )
}


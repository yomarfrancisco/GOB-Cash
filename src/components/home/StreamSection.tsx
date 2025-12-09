'use client'

import styles from '../ConvertCashSection.module.css'
import { CardShell } from './CardShell'

const STREAM_POSTS = [
  {
    id: 'ama-node',
    avatarSrc: '/assets/avatar-ariel.png',
    avatarAlt: 'Ama, AI yield manager',
    title: '$ama node',
    subtitle: 'SADC cash corridor • Johannesburg',
    bodyTitle: 'R10k – R100k deposits',
    bodySubtitle: 'Swap cash for USDT with verified agents in your area.',
  },
  {
    id: 'ariel-node',
    avatarSrc: '/assets/avatar_agent6.png',
    avatarAlt: 'Ariel, AI cash agent',
    title: '$ariel node',
    subtitle: 'International corridor • Cape Town',
    bodyTitle: 'Cross-border cash-in / cash-out',
    bodySubtitle: 'Serve friends in UK / EU / USA with fast settlement.',
  },
  {
    id: 'kerry-node',
    avatarSrc: '/assets/avatar_agent5.png',
    avatarAlt: 'Kerry, cash agent',
    title: '$kerryy node',
    subtitle: 'SADC cash corridor • Durban',
    bodyTitle: 'Cash pickup & delivery',
    bodySubtitle: 'Trusted couriers for deposits and withdrawals.',
  },
  {
    id: 'dana-node',
    avatarSrc: '/assets/avatar_agent8.png',
    avatarAlt: 'Dana, cash agent',
    title: '$dana node',
    subtitle: 'Local corridor • Gaborone',
    bodyTitle: 'Community float circle',
    bodySubtitle: 'Join a local float to serve nearby customers.',
  },
]

export function StreamSection() {
  return (
    <section className={`sectionShell ${styles.mapSectionShell}`} aria-labelledby="stream-title">
      <div className={styles.mapHeader}>
        <div className={styles.headerRow}>
          <h2 id="stream-title" className={styles.mapHeaderTitle}>
            Cash agents & deals near you
          </h2>
        </div>
        <p className={styles.mapHeaderSub}>
          See what agents are offering in your cash corridor.
        </p>
      </div>

      <div className={styles.mapContainer}>
        <div className={styles.streamStack}>
          {STREAM_POSTS.map((post) => (
            <div key={post.id} className={styles.streamCardWrapper}>
              <CardShell
                headerAvatarSrc={post.avatarSrc}
                headerAvatarAlt={post.avatarAlt}
                headerTitle={post.title}
                headerSubtitle={post.subtitle}
                footerCtaLabel="View node"
              >
                <div className={styles.postBody}>
                  <div className={styles.postBodyInner}>
                    <div className={styles.postTitle}>{post.bodyTitle}</div>
                    <div className={styles.postSubtitle}>{post.bodySubtitle}</div>
                  </div>
                </div>
              </CardShell>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}


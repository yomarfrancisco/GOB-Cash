'use client'

import Image from 'next/image'
import ActionSheet from './ActionSheet'
import styles from './AgentListSheet.module.css'

type Agent = {
  id: string
  username: string
  avatar: string
  insured: string
  rating: number
  reviewCount: number
  progress: number // 0-100 for coverage bar
}

const AGENTS: Agent[] = [
  {
    id: 'kerryy',
    username: '$kerryy',
    avatar: '/assets/avatar_agent5.png',
    insured: 'R49k',
    rating: 4.1,
    reviewCount: 1322,
    progress: 98,
  },
  {
    id: 'ariel',
    username: '$ariel',
    avatar: '/assets/avatar_agent6.png',
    insured: 'R40k',
    rating: 5.0,
    reviewCount: 3,
    progress: 80,
  },
  {
    id: 'simi_love',
    username: '$simi_love',
    avatar: '/assets/avatar_agent7.png',
    insured: 'R22k',
    rating: 4.9,
    reviewCount: 13,
    progress: 44,
  },
  {
    id: 'dana',
    username: '$dana',
    avatar: '/assets/avatar_agent8.png',
    insured: 'R11k',
    rating: 4.8,
    reviewCount: 56,
    progress: 22,
  },
]

type AgentListSheetProps = {
  open: boolean
  onClose: () => void
}

export default function AgentListSheet({ open, onClose }: AgentListSheetProps) {
  const handleWhatsAppClick = () => {
    if (typeof window === 'undefined') return
    window.open('https://wa.me/27823306256', '_blank')
  }

  return (
    <ActionSheet open={open} onClose={onClose} title="Talk to an agent" size="compact" className={styles.agentListSheet}>
      <div className={styles.content}>
        <p className={styles.subtitle}>Message a trusted branch manager on WhatsApp.</p>
        <div className={styles.divider} />
        
        {AGENTS.map((agent) => (
          <button
            key={agent.id}
            className={styles.agentRow}
            onClick={handleWhatsAppClick}
            type="button"
          >
            <div className={styles.agentRowLeft}>
              <div className={styles.avatarWrapper}>
                <Image
                  src={agent.avatar}
                  alt={agent.username}
                  width={56}
                  height={56}
                  className={styles.avatar}
                />
              </div>
              <div className={styles.agentTextBlock}>
                <div className={styles.agentHandle}>{agent.username}</div>
                <div className={styles.insuranceRow}>
                  <span className={styles.insuranceText}>Insured up to {agent.insured}</span>
                  <div className={styles.coverageBar}>
                    <div
                      className={styles.coverageBarFill}
                      style={{ width: `${agent.progress}%` }}
                    />
                  </div>
                </div>
                <div className={styles.ratingRow}>
                  <span className={styles.ratingValue}>{agent.rating}</span>
                  <Image
                    src="/assets/profile/star.svg"
                    alt="Star"
                    width={14}
                    height={14}
                    className={styles.starIcon}
                  />
                  <span className={styles.reviewCount}>({agent.reviewCount.toLocaleString()})</span>
                </div>
              </div>
            </div>
            <button
              className={styles.whatsappButton}
              onClick={(e) => {
                e.stopPropagation()
                handleWhatsAppClick()
              }}
              aria-label={`Contact ${agent.username} via WhatsApp`}
              type="button"
            >
              <Image
                src="/assets/WhatsApp_Balck.png"
                alt="WhatsApp"
                width={24}
                height={24}
                className={styles.whatsappIcon}
              />
            </button>
          </button>
        ))}
      </div>
    </ActionSheet>
  )
}

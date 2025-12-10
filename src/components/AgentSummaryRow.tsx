'use client'

import Image from 'next/image'
import { MessageSquare } from 'lucide-react'
import styles from './AgentSummaryRow.module.css'

type Agent = {
  id: string
  username: string
  avatar: string
  insured: string
  rating: number
  reviewCount: number
  progress: number // 0-100 for coverage bar
}

type AgentSummaryRowProps = {
  agent: Agent
  showWhatsappIcon?: boolean
  onWhatsAppClick?: () => void
}

export default function AgentSummaryRow({ agent, showWhatsappIcon = false, onWhatsAppClick }: AgentSummaryRowProps) {
  const handleWhatsAppClick = () => {
    if (onWhatsAppClick) {
      onWhatsAppClick()
    } else if (typeof window !== 'undefined') {
      window.open('https://wa.me/27823306256', '_blank')
    }
  }

  return (
    <div className={styles.agentRow}>
      <div className={styles.agentRowLeft}>
        <div className={styles.avatarWrapper}>
          <Image
            src={agent.avatar}
            alt={agent.username}
            width={56}
            height={56}
            className={styles.avatar}
            unoptimized
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
      {showWhatsappIcon && (
        <button
          className={styles.whatsappButton}
          onClick={handleWhatsAppClick}
          aria-label={`Contact ${agent.username} via message`}
          type="button"
        >
          <MessageSquare
            size={20}
            strokeWidth={2}
            className={styles.whatsappIcon}
            style={{ color: '#111' }}
          />
        </button>
      )}
    </div>
  )
}


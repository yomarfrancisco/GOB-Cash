'use client'

import Image from 'next/image'
import { ChevronDown, LockOpen } from 'lucide-react'
import styles from './CashAgentDetailSheet.module.css'

type Agent = {
  id: string
  username: string
  avatar: string
  insured: string
  rating: number
  reviewCount: number
  progress: number
  address: string
}

type CashAgentDetailSheetProps = {
  agent: Agent
  onAccept: () => void
  onCancel?: () => void
}

export default function CashAgentDetailSheet({ agent, onAccept, onCancel }: CashAgentDetailSheetProps) {
  const handleMessage = () => {
    console.log('TODO: open chat')
  }

  const handleCancel = () => {
    if (onCancel) {
      onCancel()
    } else {
      console.log('TODO: cancel request')
    }
  }

  // Format ETA - for now use current time + 20 min as placeholder
  const getETA = () => {
    const now = new Date()
    now.setMinutes(now.getMinutes() + 20)
    return now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  }

  // Format review count (e.g., 1800 -> 1.8K)
  const formatReviewCount = (count: number) => {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`
    }
    return count.toString()
  }

  return (
    <div className={styles.agentDetailSheet} onClick={(e) => e.stopPropagation()}>
      {/* Handle row with chevron */}
      <div className={styles.handleRow}>
        <ChevronDown className={styles.handleIcon} size={20} strokeWidth={2} />
      </div>

      {/* Title row with ETA pill */}
      <div className={styles.titleRow}>
        <div className={styles.titleText}>A dealer is coming to meet you</div>
        <div className={styles.etaPill}>{getETA()}</div>
      </div>

      {/* Progress bar */}
      <div className={styles.progressBar}>
        <div className={styles.progressFill} />
      </div>

      {/* Dealer card */}
      <div className={styles.dealerRow}>
        <div className={styles.dealerAvatarWrapper}>
          <Image
            src={agent.avatar}
            alt={agent.username}
            width={88}
            height={88}
            className={styles.dealerAvatar}
            unoptimized
          />
        </div>
        <div className={styles.dealerInfo}>
          <div className={styles.dealerUsername}>{agent.username}</div>
          <div className={styles.dealerRatingRow}>
            <span className={styles.ratingValue}>{agent.rating}</span>
            <Image
              src="/assets/profile/star.svg"
              alt="Star"
              width={14}
              height={14}
              className={styles.starIcon}
            />
            <span className={styles.reviewCount}>({formatReviewCount(agent.reviewCount)})</span>
          </div>
          <div className={styles.dealerLicenseRow}>
            <span className={styles.licenseLabel}>Dealer license</span>
            <div className={styles.licenseBar}>
              <div
                className={styles.licenseBarFill}
                style={{ width: `${agent.progress}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className={styles.actions}>
        <button className={styles.messageButton} onClick={handleMessage} type="button">
          <span>Message</span>
          <div className={styles.lockIconWrapper}>
            <LockOpen size={16} strokeWidth={2} />
          </div>
        </button>
        <button className={styles.cancelButton} onClick={handleCancel} type="button">
          Cancel your request
        </button>
      </div>
    </div>
  )
}


'use client'

import Image from 'next/image'
import styles from './FinancialInboxChatSheet.module.css'

export interface ChatHeaderProps {
  avatarSrc?: string // Default: '/assets/Brics-girl-blue.png'
  avatarSize?: number // Default: 38
  name: string // e.g., "Ama — Investment Manager"
  showBackButton?: boolean // Default: false
  onBack?: () => void
}

/**
 * Chat header component matching Ama chat format
 * Pure UI renderer - no business logic
 */
export default function ChatHeader({
  avatarSrc = '/assets/Brics-girl-blue.png',
  avatarSize = 38,
  name,
  showBackButton = false,
  onBack,
}: ChatHeaderProps) {
  return (
    <>
      <div className={styles.usernameRow}>
        {showBackButton && (
          <button
            className={styles.backButton}
            onClick={onBack}
            aria-label="Back"
            type="button"
          >
            <Image
              src="/assets/back_ui.svg"
              alt="Back"
              width={24}
              height={24}
            />
          </button>
        )}
        <div className={styles.avatar}>
          <Image
            src={avatarSrc}
            alt={name}
            width={avatarSize}
            height={avatarSize}
            className={styles.avatarImage}
            sizes={`${avatarSize}px`}
            quality={92}
          />
        </div>
        <div className={styles.name}>{name}</div>
      </div>
      <div className={styles.divider} />
    </>
  )
}



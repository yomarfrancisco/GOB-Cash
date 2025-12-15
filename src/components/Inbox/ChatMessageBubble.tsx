'use client'

import Image from 'next/image'
import clsx from 'clsx'
import styles from './FinancialInboxChatSheet.module.css'
import { renderRichContent } from '@/lib/chat/renderRichContent'

export interface ChatMessageBubbleProps {
  message: {
    id: string
    from: 'ai' | 'user'
    text: string
    buttons?: Array<{
      label: string
      onClick: () => void
      variant?: 'primary' | 'secondary'
    }>
  }
  avatarSrc?: string // Default: '/assets/Brics-girl-blue.png'
  avatarSize?: number // Default: 31
  theme?: 'ama' | 'default' // Default: 'ama'
  onHandleClick?: (handle: string) => void // For @handle links
}

/**
 * Chat message bubble component matching Ama chat format
 * Pure UI renderer - no business logic
 */
export default function ChatMessageBubble({
  message,
  avatarSrc = '/assets/Brics-girl-blue.png',
  avatarSize = 31,
  theme = 'ama',
  onHandleClick,
}: ChatMessageBubbleProps) {
  const isAi = message.from === 'ai'
  const showAvatar = isAi

  return (
    <div className={styles.messageWrapper}>
      {showAvatar && (
        <div className={styles.messageAvatar}>
          <Image
            src={avatarSrc}
            alt={isAi ? 'Ama' : 'User'}
            width={avatarSize}
            height={avatarSize}
            className={styles.messageAvatarImage}
            sizes={`${avatarSize}px`}
            quality={92}
          />
        </div>
      )}
      <div className={styles.bubbleContainer}>
        {isAi ? (
          <div className={clsx(styles.messageBubble, styles.agentBubble)}>
            {renderRichContent(message.text, { onHandleClick })}
            {message.buttons && message.buttons.length > 0 && (
              <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {message.buttons.map((button, idx) => (
                  <button
                    key={idx}
                    className={styles.chatCtaButton}
                    onClick={button.onClick}
                    type="button"
                    style={
                      button.variant === 'secondary'
                        ? { background: 'transparent', border: '1px solid #000', color: '#000' }
                        : undefined
                    }
                  >
                    {button.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className={styles.userMessageBubble}>
            {message.text.split('\n').map((line, idx) => (
              <div key={idx}>
                {idx > 0 && <br />}
                {line}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}


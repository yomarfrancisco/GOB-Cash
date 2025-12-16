'use client'

import clsx from 'clsx'
import styles from './FinancialInboxChatSheet.module.css'

export default function TypingBubble() {
  return (
    <div className={clsx(styles.messageBubble, styles.amaIntroTypingBubble)}>
      <div className={styles.typingDots}>
        <span />
        <span />
        <span />
      </div>
    </div>
  )
}


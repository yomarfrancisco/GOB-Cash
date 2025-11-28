'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { useFinancialInboxStore } from '@/state/financialInbox'
import ChatInputBar from './ChatInputBar'
import styles from './DirectMessage.module.css'

type DirectMessageProps = {
  threadId: string
}

export default function DirectMessage({ threadId }: DirectMessageProps) {
  const { messagesByThreadId, threads, sendMessage, setActiveThread } = useFinancialInboxStore()
  const [inputText, setInputText] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  const messages = messagesByThreadId[threadId] || []
  const thread = threads.find((t) => t.id === threadId)

  // Flag to track if conversation is short (based on pre-keyboard measurement)
  const isShortConversationRef = useRef<boolean>(false)

  // Measure conversation height on mount/when thread changes (before keyboard)
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return
    
    // Measure once, pre-keyboard, to decide if content is truly short
    // Use requestAnimationFrame to ensure layout has settled
    requestAnimationFrame(() => {
      if (container) {
        const { scrollHeight, clientHeight } = container
        isShortConversationRef.current = scrollHeight <= clientHeight + 4
      }
    })
  }, [threadId, messages]) // Re-measure when thread or messages change

  // Helper: Only scroll to bottom if there's actual overflow in the container
  const scrollToBottomIfOverflow = () => {
    const container = messagesContainerRef.current
    if (!container) return

    const scrollHeight = container.scrollHeight
    const clientHeight = container.clientHeight
    const overflow = scrollHeight - clientHeight

    // If there is no meaningful overflow, do NOT move the scroll at all.
    // This is the "short conversation" case.
    if (overflow <= 8) {
      // Keep whatever scrollTop iOS chose; do NOT force to 0 or bottom.
      return
    }

    // Only for long threads: keep bottom in view.
    requestAnimationFrame(() => {
      if (container) {
        container.scrollTop = container.scrollHeight
      }
    })
  }

  // Scroll to bottom when new messages arrive (only if overflow)
  useEffect(() => {
    scrollToBottomIfOverflow()
  }, [messages.length])

  const handleSend = () => {
    if (!inputText.trim()) return

    // Send user message
    sendMessage(threadId, 'user', inputText.trim())
    setInputText('')

    // Add stub AI reply after delay
    setTimeout(() => {
      sendMessage(
        threadId,
        'ai',
        "Got it – I'll keep you posted on your portfolio. This will later come from the BabyCDO backend."
      )
    }, 800)
  }

  const handleBack = () => {
    setActiveThread(null) // Return to inbox list
  }

  return (
    <div className={styles.directMessage}>
      {/* Header */}
      <div className={styles.messageHeader}>
        <button onClick={handleBack} className={styles.backButton} aria-label="Back">
          <Image
            className={styles.ico24ArrowsBackUi}
            src="/assets/back_ui.svg"
            alt="Back"
            width={24}
            height={24}
          />
        </button>
        <div className={styles.profileHeader}>
          <Image
            className={styles.avatarProfile}
            src={thread?.avatarUrl || '/assets/Brics-girl-blue.png'}
            alt={thread?.title || 'BabyCDO'}
            width={32}
            height={32}
            unoptimized
          />
          <div className={styles.usernameProfileWrapper}>
            <div className={styles.usernameProfile}>
              <div className={styles.textInput}>
                <div className={styles.text}>{thread?.title || 'BabyCDO'}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div ref={messagesContainerRef} className={styles.frameParent}>
        {messages.map((message, index) => {
          // Show date chip before first message
          const showDateChip = index === 0
          
          return (
            <div key={message.id}>
              {showDateChip && (
                <div className={styles.component1}>
                  <div className={styles.dealerHasAccepted}>Wed, 27 Feb</div>
                </div>
              )}
              
              {message.from === 'user' ? (
                <div className={styles.frameWrapper}>
                  <div className={styles.dmMessageParent}>
                    <div className={styles.dmMessage}>
                      <div className={styles.description}>
                        <div className={styles.dealerHasAccepted}>{message.text}</div>
                      </div>
                    </div>
                    <div className={styles.dmTimestamp}>
                      <div className={styles.dealerHasAccepted}>{message.createdAt}</div>
                      <Image
                        className={styles.ico24UiAllDone}
                        src="/assets/all_done.svg"
                        alt="Delivered"
                        width={16}
                        height={16}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className={styles.avatarDmParent}>
                  <div className={styles.avatarDm}>
                    <Image
                      className={styles.appIcon}
                      src="/assets/Brics-girl-blue.png"
                      alt="BabyCDO"
                      width={32}
                      height={32}
                      unoptimized
                    />
                  </div>
                  <div className={message.text.length > 100 ? styles.dmMessageContainer : styles.dmMessageGroup}>
                    <div className={message.text.length > 100 ? styles.dmMessage2 : styles.directMessageDmMessage}>
                      <div className={message.text.length > 100 ? styles.description2 : styles.description}>
                        <div className={message.text.length > 100 ? styles.dealerHasAccepted2 : styles.dealerHasAccepted}>
                          {message.text}
                        </div>
                      </div>
                    </div>
                    <div className={message.text.length > 100 ? styles.directMessageTime : styles.time}>
                      <div className={styles.dealerHasAccepted}>{message.createdAt}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* INPUT BAR */}
      <ChatInputBar
        value={inputText}
        onChange={setInputText}
        onSend={handleSend}
        placeholder="Add a message"
        // No onInputFocus - we don't want scroll on focus, only on message changes
      />
    </div>
  )
}


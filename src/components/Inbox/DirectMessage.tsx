'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { useFinancialInboxStore } from '@/state/financialInbox'
import styles from './DirectMessage.module.css'

type DirectMessageProps = {
  threadId: string
}

export default function DirectMessage({ threadId }: DirectMessageProps) {
  const { messagesByThreadId, threads, sendMessage, setActiveThread } = useFinancialInboxStore()
  const [inputText, setInputText] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const messages = messagesByThreadId[threadId] || []
  const thread = threads.find((t) => t.id === threadId)

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault()
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

      <div className={styles.frameParent}>
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
      <div className={styles.commentInput}>
        <form className={styles.inputAndIcons} onSubmit={handleSend}>
          <Image
            className={styles.ico24UiAttachmentDia}
            src="/assets/attachment_diagonal.svg"
            alt="Attach"
            width={24}
            height={24}
          />
          <input
            type="text"
            className={styles.button}
            placeholder="Add a message"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />
          {inputText.trim() && (
            <button
              type="submit"
              className={styles.sendButton}
              aria-label="Send message"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
        </form>
      </div>
    </div>
  )
}


'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import clsx from 'clsx'
import ActionSheet from '../ActionSheet'
import { useFinancialInboxStore } from '@/state/financialInbox'
import { useAuthStore } from '@/store/auth'
import listStyles from './FinancialInboxListSheet.module.css'
import chatStyles from './FinancialInboxChatSheet.module.css'
import walletHelperStyles from '../WalletHelperSheet.module.css'
import mapHelperStyles from '../MapHelperSheet.module.css'

// Ama intro message text constant
const AMA_INTRO_TEXT = "GoB helps you invest, pay, and move cash. What would you like to do first?"

// Intro stage state machine
type IntroStage = 'typingIndicator' | 'typingMessage' | 'cards' | 'done'

// Typing indicator component (3 dots)
function TypingBubble() {
  return (
    <div className={chatStyles.messageBubble}>
      <div className={chatStyles.typingDots}>
        <span />
        <span />
        <span />
      </div>
    </div>
  )
}

// Typed message bubble with fast typewriter effect and embedded card tile
function TypedMessageBubble({ text, animate, showCard, introStage, isDemoIntro, onTypingComplete }: { text: string; animate: boolean; showCard?: boolean; introStage?: IntroStage; isDemoIntro?: boolean; onTypingComplete?: () => void }) {
  const [displayed, setDisplayed] = useState(text)

  useEffect(() => {
    if (!animate) {
      setDisplayed(text)
      if (onTypingComplete) {
        onTypingComplete()
      }
      return
    }

    setDisplayed('')
    const CHARS_PER_TICK = 5
    const TICK_MS = 30
    let i = 0

    const id = window.setInterval(() => {
      i += CHARS_PER_TICK
      if (i >= text.length) {
        setDisplayed(text)
        window.clearInterval(id)
        // Call completion callback when typing finishes
        if (onTypingComplete) {
          onTypingComplete()
        }
      } else {
        setDisplayed(text.slice(0, i))
      }
    }, TICK_MS)

    return () => window.clearInterval(id)
  }, [text, animate, onTypingComplete])

  // Split text to make final sentence bold
  const FINAL_SENTENCE = 'What would you like to do first?'
  const textParts = text.split(FINAL_SENTENCE)
  const mainText = textParts[0]
  const mainTextLength = mainText.length
  
  // Determine what portion of text is displayed
  let displayedMain = ''
  let displayedFinal = ''
  
  if (displayed.length <= mainTextLength) {
    // Still typing main text
    displayedMain = displayed
  } else {
    // Main text is complete, now typing final sentence
    displayedMain = mainText
    displayedFinal = displayed.slice(mainTextLength)
  }

  return (
    <div className={clsx(chatStyles.messageBubble, chatStyles.amaIntroMessageBubble)}>
      <p>
        {displayedMain}
        {displayedFinal && <strong>{displayedFinal}</strong>}
      </p>
      {showCard && (
        <div className={clsx(
          walletHelperStyles.amaIntroCardBlockWrapper,
          chatStyles.amaIntroCardBlock,
          (introStage === 'cards' || introStage === 'done') && chatStyles.amaIntroCardBlockVisible
        )}>
          {/* 1) ZAR savings card */}
          <div className={clsx(walletHelperStyles.tile, walletHelperStyles.compactTile, chatStyles.amaIntroTile, chatStyles.amaIntroTileFirst)}>
            <div className={walletHelperStyles.cardPreviewContainer}>
              {/* APY pill overlay - single line for chat */}
              <div className={clsx(
                walletHelperStyles.amaIntroApyPill,
                chatStyles.amaIntroApyPillAnimated,
                (introStage === 'cards' || introStage === 'done') && chatStyles.amaIntroApyPillVisible
              )}>
                <span className={walletHelperStyles.amaIntroApyText}>9.38% APY</span>
              </div>
              {/* Card preview (compact) */}
              <div className={clsx(walletHelperStyles.cardPreview, walletHelperStyles.compactCardPreview)}>
                <Image
                  src="/assets/cards/card-savings.jpg"
                  alt="ZAR savings wallet"
                  fill
                  className={walletHelperStyles.cardImage}
                  sizes="176px"
                  unoptimized
                />
              </div>
            </div>
            {/* Compact text - heading must stay on one line */}
            <h3 className={chatStyles.promoTitle}>
              Earn interest on your deposits
            </h3>
            <p className={chatStyles.promoSubtext}>
              Compounded monthly
            </p>
          </div>

          {/* 2) Map tile */}
          <div className={clsx(mapHelperStyles.tile, chatStyles.amaIntroTile, chatStyles.amaIntroTileStaggered)}>
            <div className={clsx(mapHelperStyles.mapPreview, chatStyles.amaIntroMapPreview)}>
              <Image
                src="/assets/map2.png"
                alt="Dealer map"
                fill
                className={mapHelperStyles.mapImage}
                sizes="100%"
                unoptimized
              />
            </div>
            <h3 className={chatStyles.promoTitle}>
              Find cash agents near you
            </h3>
            <p className={chatStyles.promoSubtext}>
              Agents deliver cash door to door
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

type FinancialInboxSheetProps = {
  onRequestAgent?: () => void // Deprecated: no longer used, kept for backward compatibility
  isDemoIntro?: boolean // If true, shows animated typing indicator and typewriter effect for landing demo
}

/**
 * Unified Financial Inbox Sheet - switches between inbox list and chat view
 * Single ActionSheet that changes content based on inboxViewMode
 * NOTE: This sheet is now accessible from Profile → Settings → Inbox.
 * The "Request cash agent" button has been removed.
 */
export default function FinancialInboxSheet({ onRequestAgent, isDemoIntro: propIsDemoIntro }: FinancialInboxSheetProps) {
  const { 
    isInboxOpen, 
    inboxViewMode, 
    closeInbox, 
    openChatSheet,
    goBackToInbox,
    isDemoIntro: storeIsDemoIntro
  } = useFinancialInboxStore()
  
  // Use prop if provided, otherwise fall back to store flag
  const isDemoIntro = propIsDemoIntro !== undefined ? propIsDemoIntro : storeIsDemoIntro

  // Intro stage state machine - only for landing demo
  const [introStage, setIntroStage] = useState<IntroStage>('typingIndicator')

  // Manage intro stages for demo intro - only in chat view
  useEffect(() => {
    // Reset when switching away from chat view or when not demo intro
    if (!isDemoIntro || inboxViewMode !== 'chat' || !isInboxOpen) {
      setIntroStage('done')
      return
    }

    // Reset to typing indicator when conditions are met (sheet just opened in demo intro mode)
    setIntroStage('typingIndicator')

    // Stage 1: typing indicator for ~1.3s
    const TYPING_INDICATOR_MS = 1300
    const t1 = setTimeout(() => {
      // Only transition if still in demo intro mode and chat view
      if (isDemoIntro && inboxViewMode === 'chat' && isInboxOpen) {
        setIntroStage('typingMessage')
      }
    }, TYPING_INDICATOR_MS)

    return () => {
      clearTimeout(t1)
    }
  }, [isDemoIntro, inboxViewMode, isInboxOpen])

  // Callback when typing completes - transition to cards stage
  const handleTypingComplete = useCallback(() => {
    if (isDemoIntro && inboxViewMode === 'chat' && isInboxOpen) {
      setIntroStage('cards')
      // Show CTA bubble after map animation completes (280ms card + 120ms delay = 400ms total)
      setTimeout(() => {
        if (isDemoIntro && inboxViewMode === 'chat' && isInboxOpen) {
          setIntroStage('done')
        }
      }, 400)
    }
  }, [isDemoIntro, inboxViewMode, isInboxOpen])

  // Cash agents data - static demo content
  const agents = [
    {
      id: 'ama',
      name: 'Ama — Investment Manager',
      avatar: '/assets/Brics-girl-blue.png',
      preview: 'Welcome! I can help you join a group or find a trusted cash agent.',
      time: '16:09',
      isOnline: true,
      unread: true,
    },
    {
      id: 'kerry',
      name: '$kerry',
      avatar: '/assets/avatar - profile (1).png',
      preview: 'Available for cash pickup in Sandton.',
      time: '15:30',
      isOnline: false,
      unread: false,
    },
    {
      id: 'simi_love',
      name: '$simi_love',
      avatar: '/assets/avatar - profile (2).png',
      preview: 'Online · can meet at your bank branch.',
      time: '14:45',
      isOnline: true,
      unread: false,
    },
    {
      id: 'ariel',
      name: '$ariel',
      avatar: '/assets/avatar - profile (3).png',
      preview: 'Verified agent · specialises in larger amounts.',
      time: '13:20',
      isOnline: false,
      unread: false,
    },
    {
      id: 'dana',
      name: '$dana',
      avatar: '/assets/avatar - profile (4).png',
      preview: 'Cash drop-off near Rosebank / Sandton.',
      time: '12:15',
      isOnline: false,
      unread: false,
    },
  ]

  const handleRowClick = (id: string) => {
    // NOTE: Row clicks are auth-gated in parent component
    // This handler only handles navigation logic after auth
    if (id === 'ama') {
      openChatSheet('portfolio-manager')
    }
    // Other rows are static for now
  }

  // Determine title based on view mode
  const sheetTitle = inboxViewMode === 'inbox' ? 'Inbox' : ''

  return (
    <ActionSheet
      open={isInboxOpen}
      onClose={closeInbox}
      title={sheetTitle}
      size="tall"
      className={`${listStyles.financialInboxSheet} inboxTallSheet`}
    >
      {inboxViewMode === 'inbox' ? (
        // Inbox list view
        <>
          <div className={listStyles.content}>
            <p className={listStyles.subtitle}>Connect with verified cash agents and community members</p>
            <div className={listStyles.divider} />
            
            {/* Search bar */}
            <div className={listStyles.searchBar}>
              <div className={listStyles.searchIcon}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
                  <path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <input
                type="text"
                className={listStyles.searchInput}
                placeholder="Search cash agents"
              />
            </div>

            {/* Agent list - scrollable */}
            <div className={listStyles.conversationList}>
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  className={listStyles.inboxRow}
                  onClick={() => handleRowClick(agent.id)}
                  type="button"
                >
                  <div className={listStyles.inboxRowLeft}>
                    <div className={listStyles.avatarWrapper}>
                      <Image
                        src={agent.avatar}
                        alt={agent.name}
                        width={64}
                        height={64}
                        className={listStyles.avatar}
                        unoptimized
                      />
                    </div>
                    <div className={listStyles.inboxTextBlock}>
                      <div className={listStyles.inboxHeader}>
                        <div className={listStyles.inboxTitle}>{agent.name}</div>
                        <div className={listStyles.inboxTimeRow}>
                          <div className={listStyles.inboxTime}>{agent.time}</div>
                          {agent.unread && (
                            <div className={listStyles.unreadDot} />
                          )}
                        </div>
                      </div>
                      <div className={listStyles.inboxPreview}>
                        {agent.preview}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* NOTE: "Request cash agent" button removed - this sheet is now read-only inbox view */}
        </>
      ) : (
        // Chat view
        <div className={chatStyles.container}>
          {/* Username row - no separate close button row, ActionSheet provides the close button */}
          <div className={chatStyles.usernameRow}>
            <button className={chatStyles.backButton} onClick={goBackToInbox} aria-label="Back">
              <Image
                src="/assets/back_ui.svg"
                alt="Back"
                width={24}
                height={24}
              />
            </button>
            <div className={chatStyles.avatar}>
              <Image
                src="/assets/Brics-girl-blue.png"
                alt="Ama — Investment Manager"
                width={38}
                height={38}
                className={chatStyles.avatarImage}
                unoptimized
              />
            </div>
            <div className={chatStyles.name}>Ama — Investment Manager</div>
          </div>

          {/* Divider line */}
          <div className={chatStyles.divider} />

          {/* Message area */}
          <div className={chatStyles.messageArea}>
            <div className={chatStyles.messageWrapper}>
              <div className={chatStyles.messageAvatar}>
                <Image
                  src="/assets/Brics-girl-blue.png"
                  alt="Baby Diamond"
                  width={31}
                  height={31}
                  className={chatStyles.messageAvatarImage}
                  unoptimized
                />
              </div>
              <div className={chatStyles.bubbleContainer}>
                {isDemoIntro ? (
                  <>
                    {introStage === 'typingIndicator' && <TypingBubble />}
                    {introStage !== 'typingIndicator' && (
                      <TypedMessageBubble
                        text={AMA_INTRO_TEXT}
                        animate={introStage === 'typingMessage'}
                        showCard={true}
                        introStage={introStage}
                        isDemoIntro={isDemoIntro}
                        onTypingComplete={handleTypingComplete}
                      />
                    )}
                    {/* Get Started CTA in separate bubble - only show after map animation */}
                    {introStage === 'done' && (
                      <div className={clsx(chatStyles.messageBubble, chatStyles.amaIntroCtaBubble)}>
                        <button
                          className={chatStyles.chatCtaButton}
                          onClick={() => {
                            const { openAuthEntrySignup } = useAuthStore.getState()
                            openAuthEntrySignup()
                          }}
                          type="button"
                        >
                          Get Started
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className={chatStyles.messageBubble}>
                    {AMA_INTRO_TEXT}
                  </div>
                )}
                <div className={chatStyles.timestamp}>14:09</div>
              </div>
            </div>
          </div>

          {/* Input bar - no divider line above */}
          <div className={chatStyles.inputBar}>
            <button className={chatStyles.attachButton} aria-label="Attach">
              <Image
                src="/assets/attachment_diagonal.svg"
                alt="Attach"
                width={24}
                height={24}
              />
            </button>
            <input
              type="text"
              className={chatStyles.input}
              placeholder="Add a message"
            />
          </div>
        </div>
      )}
    </ActionSheet>
  )
}


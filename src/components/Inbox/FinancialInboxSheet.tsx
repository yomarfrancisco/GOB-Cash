'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import clsx from 'clsx'
import { Copy, RefreshCcw } from 'lucide-react'
import ActionSheet from '../ActionSheet'
import { useFinancialInboxStore } from '@/state/financialInbox'
import { useAuthStore } from '@/store/auth'
import { useCashFlowStateStore } from '@/state/cashFlowState'
import { useUserProfileStore } from '@/store/userProfile'
import ChatInputBar from './ChatInputBar'
import ChatMapEmbed from './ChatMapEmbed'
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
    <div className={clsx(chatStyles.messageBubble, chatStyles.amaIntroTypingBubble)}>
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
const PORTFOLIO_MANAGER_THREAD_ID = 'portfolio-manager'

export default function FinancialInboxSheet({ onRequestAgent, isDemoIntro: propIsDemoIntro }: FinancialInboxSheetProps) {
  const { 
    isInboxOpen, 
    inboxViewMode, 
    closeInbox, 
    openChatSheet,
    goBackToInbox,
    isDemoIntro: storeIsDemoIntro,
    sendMessage,
    messagesByThreadId,
    cashDepositScenario,
    endCashDepositScenario,
    cashWithdrawalScenario,
    endCashWithdrawalScenario,
  } = useFinancialInboxStore()
  
  // Get auth state for pre-auth gating
  const { isAuthed, openAuthEntrySignup } = useAuthStore()
  const { cashFlowState, confirmCashDeposit, confirmCashWithdrawal } = useCashFlowStateStore()
  const { profile } = useUserProfileStore()
  
  // Use prop if provided, otherwise fall back to store flag
  const isDemoIntro = propIsDemoIntro !== undefined ? propIsDemoIntro : storeIsDemoIntro

  // Handler for clicking agent handle
  const handleOpenAgentProfile = useCallback((handle: string) => {
    console.log('Open profile:', handle)
    // TODO: Wire up to actual profile screen
  }, [])

  // Expose handleOpenAgentProfile to window for inline onclick handlers
  useEffect(() => {
    if (typeof window !== 'undefined') {
      ;(window as any).handleOpenAgentProfile = handleOpenAgentProfile
    }
    return () => {
      if (typeof window !== 'undefined') {
        delete (window as any).handleOpenAgentProfile
      }
    }
  }, [handleOpenAgentProfile])

  // Intro stage state machine - only for landing demo
  const [introStage, setIntroStage] = useState<IntroStage>('typingIndicator')
  
  // Input text state for chat
  const [inputText, setInputText] = useState('')
  
  // Cash deposit/withdrawal scenario state
  const [scenarioMessagesSent, setScenarioMessagesSent] = useState<Set<string>>(new Set())
  const [isTyping, setIsTyping] = useState(false)
  const [showMapCard, setShowMapCard] = useState(false)
  const [showConfirmButton, setShowConfirmButton] = useState(false)
  
  // Determine active scenario
  const isCashDepositActive = !!cashDepositScenario
  const isCashWithdrawalActive = !!cashWithdrawalScenario
  const activeScenario = cashDepositScenario || cashWithdrawalScenario
  const scenarioType = cashDepositScenario ? 'deposit' : cashWithdrawalScenario ? 'withdrawal' : null
  const isAnyCashFlowActive = isCashDepositActive || isCashWithdrawalActive
  
  // Ref for message area container (for scroll calculations)
  const messageAreaRef = useRef<HTMLDivElement>(null)
  
  // Store pre-keyboard scrollHeight to determine if conversation is short
  const preKeyboardScrollHeightRef = useRef<number | null>(null)
  
  // Get messages for the portfolio manager thread
  const pmMessages = messagesByThreadId[PORTFOLIO_MANAGER_THREAD_ID] || []
  
  // Get first name from fullName
  const firstName = profile.fullName.split(' ')[0] || 'there'
  
  // Measure conversation height on mount/when chat view opens (before keyboard)
  useEffect(() => {
    // Only measure when chat view is open and container is ready
    if (inboxViewMode !== 'chat' || !isInboxOpen) {
      preKeyboardScrollHeightRef.current = null
      return
    }
    
    const container = messageAreaRef.current
    if (!container) return
    
    // Measure once, pre-keyboard, to capture the true content height
    // Use requestAnimationFrame to ensure layout has settled
    requestAnimationFrame(() => {
      if (container) {
        // Store the scrollHeight (content height) before keyboard opens
        // This is the true measure of whether content is short or long
        preKeyboardScrollHeightRef.current = container.scrollHeight
      }
    })
  }, [inboxViewMode, isInboxOpen, isDemoIntro, introStage, pmMessages.length]) // Re-measure when conversation changes
  
  // Helper: Only scroll to bottom if there's actual overflow in the container
  const scrollToBottomIfOverflow = useCallback(() => {
    const container = messageAreaRef.current
    if (!container) return

    // Use pre-keyboard scrollHeight to determine if conversation is short
    // This prevents false overflow detection when keyboard shrinks clientHeight
    const preKeyboardScrollHeight = preKeyboardScrollHeightRef.current
    if (preKeyboardScrollHeight === null) {
      // Not measured yet, skip scroll
      return
    }

    const currentClientHeight = container.clientHeight
    
    // Compare pre-keyboard content height to current viewport
    // If content fits in viewport (even with keyboard), it's a short conversation
    const overflow = preKeyboardScrollHeight - currentClientHeight

    // If there is no meaningful overflow, do NOT move the scroll at all.
    // This is the "short conversation" case.
    if (overflow <= 8) {
      // Keep whatever scrollTop mobile browser chose; do NOT force to 0 or bottom.
      return
    }

    // Only for long threads: keep bottom in view.
    requestAnimationFrame(() => {
      if (container) {
        container.scrollTop = container.scrollHeight
      }
    })
  }, [])
  
  // Auto-scroll only when messages change, and only for DM view (not intro tiles)
  useEffect(() => {
    if (!messageAreaRef.current) return
    
    // Only auto-scroll for the DM view, not the intro tiles
    if (!isDemoIntro && inboxViewMode === 'chat') {
      scrollToBottomIfOverflow()
    }
  }, [pmMessages.length, isDemoIntro, inboxViewMode, scrollToBottomIfOverflow])
  
  // Send message handler
  const handleSend = useCallback(() => {
    if (!inputText.trim()) return
    
    // Send user message
    sendMessage(PORTFOLIO_MANAGER_THREAD_ID, 'user', inputText.trim())
    setInputText('')
    
    // Add stub AI reply after delay
    setTimeout(() => {
      sendMessage(
        PORTFOLIO_MANAGER_THREAD_ID,
        'ai',
        "Got it – I'll help you with that. This will later come from the BabyCDO backend."
      )
    }, 800)
  }, [inputText, sendMessage])

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

  // Cash deposit scenario orchestration
  // Send initial messages when scenario starts
  useEffect(() => {
    if (!isCashDepositActive || !cashDepositScenario || inboxViewMode !== 'chat') return
    
    // Message 1: Initial greeting (after 600ms delay)
    if (!scenarioMessagesSent.has('deposit_message1')) {
      const amount = cashDepositScenario.amountZAR
      const formattedAmount = amount.toLocaleString('en-ZA', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
      
      setTimeout(() => {
        sendMessage(
          PORTFOLIO_MANAGER_THREAD_ID,
          'ai',
          `Hi ${firstName}, you requested a cash deposit of R${formattedAmount}… Give me a moment while I find a verified dealer near you.`
        )
        
        setScenarioMessagesSent(prev => new Set(prev).add('deposit_message1'))
        setIsTyping(true)
        
        // After 4 seconds of typing, send message 2
        setTimeout(() => {
          setIsTyping(false)
          if (!scenarioMessagesSent.has('deposit_message2')) {
            sendMessage(
              PORTFOLIO_MANAGER_THREAD_ID,
              'ai',
              'Great news — @skerryy can meet you. ETA: 20 minutes. Distance: 7.8 km. You can follow her progress on the map below.'
            )
            setScenarioMessagesSent(prev => new Set(prev).add('deposit_message2'))
            setShowMapCard(true)
          }
        }, 4000) // 4 seconds typing delay
      }, 600) // 600ms initial delay
    }
  }, [isCashDepositActive, cashDepositScenario, scenarioMessagesSent, firstName, sendMessage, inboxViewMode])

  // Cash withdrawal scenario orchestration
  // Send initial messages when scenario starts
  useEffect(() => {
    if (!isCashWithdrawalActive || !cashWithdrawalScenario || inboxViewMode !== 'chat') return
    
    // Message 1: Initial greeting (after 600ms delay)
    if (!scenarioMessagesSent.has('withdrawal_message1')) {
      const amount = cashWithdrawalScenario.amountZAR
      const formattedAmount = amount.toLocaleString('en-ZA', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
      
      setTimeout(() => {
        sendMessage(
          PORTFOLIO_MANAGER_THREAD_ID,
          'ai',
          `Hi ${firstName}, you want to withdraw R${formattedAmount}. Give me a moment while I find a verified dealer who can bring the cash to you.`
        )
        
        setScenarioMessagesSent(prev => new Set(prev).add('withdrawal_message1'))
        setIsTyping(true)
        
        // After 4 seconds of typing, send message 2
        setTimeout(() => {
          setIsTyping(false)
          if (!scenarioMessagesSent.has('withdrawal_message2')) {
            sendMessage(
              PORTFOLIO_MANAGER_THREAD_ID,
              'ai',
              'Great news — @skerryy is available to complete your withdrawal. ETA: 20 minutes. Distance: 7.8 km. You can follow her progress on the map below.'
            )
            setScenarioMessagesSent(prev => new Set(prev).add('withdrawal_message2'))
            setShowMapCard(true)
          }
        }, 4000) // 4 seconds typing delay
      }, 600) // 600ms initial delay
    }
  }, [isCashWithdrawalActive, cashWithdrawalScenario, scenarioMessagesSent, firstName, sendMessage, inboxViewMode])

  // Handle state machine transitions for deposit
  useEffect(() => {
    if (!isCashDepositActive || inboxViewMode !== 'chat') return
    
    // ARRIVED state: show confirm button message (with minimum 15s typing delay)
    if (cashFlowState === 'ARRIVED' && !scenarioMessagesSent.has('deposit_arrived')) {
      // Track when agent arrived
      const arrivedAt = Date.now()
      setIsTyping(true)
      
      // Minimum 15 seconds typing before showing message 3
      setTimeout(() => {
        setIsTyping(false)
        if (!scenarioMessagesSent.has('deposit_arrived')) {
          sendMessage(
            PORTFOLIO_MANAGER_THREAD_ID,
            'ai',
            'Kerry has arrived. Once you\'ve handed over the cash, tap the button below to confirm.'
          )
          setScenarioMessagesSent(prev => new Set(prev).add('deposit_arrived'))
          setShowConfirmButton(true)
        }
      }, 15000) // Minimum 15 seconds typing delay
    }
    
    // IN_TRANSIT_TO_HQ state: show transit message
    if (cashFlowState === 'IN_TRANSIT_TO_HQ' && !scenarioMessagesSent.has('deposit_inTransit')) {
      sendMessage(
        PORTFOLIO_MANAGER_THREAD_ID,
        'ai',
        'Cash in transit to HQ. Your deposit is on its way to GoBankless HQ.'
      )
      setScenarioMessagesSent(prev => new Set(prev).add('deposit_inTransit'))
      setShowConfirmButton(false)
    }
    
    // COMPLETED state: show completion message
    if (cashFlowState === 'COMPLETED' && !scenarioMessagesSent.has('deposit_completed')) {
      const amount = cashDepositScenario?.amountZAR || 0
      const formattedAmount = amount.toLocaleString('en-ZA', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
      
      sendMessage(
        PORTFOLIO_MANAGER_THREAD_ID,
        'ai',
        `Done! Your cash has been converted into USDT. Your updated balance is available in your wallet.`
      )
      setScenarioMessagesSent(prev => new Set(prev).add('deposit_completed'))
      endCashDepositScenario()
    }
  }, [cashFlowState, isCashDepositActive, scenarioMessagesSent, cashDepositScenario, sendMessage, endCashDepositScenario, inboxViewMode])

  // Handle state machine transitions for withdrawal
  useEffect(() => {
    if (!isCashWithdrawalActive || inboxViewMode !== 'chat') return
    
    // ARRIVED state: show confirm button message (with minimum 15s typing delay)
    if (cashFlowState === 'ARRIVED' && !scenarioMessagesSent.has('withdrawal_arrived')) {
      setIsTyping(true)
      
      // Minimum 15 seconds typing before showing message 3
      setTimeout(() => {
        setIsTyping(false)
        if (!scenarioMessagesSent.has('withdrawal_arrived')) {
          sendMessage(
            PORTFOLIO_MANAGER_THREAD_ID,
            'ai',
            '@skerryy has arrived. Once you\'ve received your cash, tap the button below to confirm.'
          )
          setScenarioMessagesSent(prev => new Set(prev).add('withdrawal_arrived'))
          setShowConfirmButton(true)
        }
      }, 15000) // Minimum 15 seconds typing delay
    }
    
    // WITHDRAWAL_CONFIRMED state: show final message (after 1.5s typing)
    if (cashFlowState === 'WITHDRAWAL_CONFIRMED' && !scenarioMessagesSent.has('withdrawal_confirmed')) {
      setIsTyping(true)
      
      setTimeout(() => {
        setIsTyping(false)
        if (!scenarioMessagesSent.has('confirmed')) {
          const amount = cashWithdrawalScenario?.amountZAR || 0
          const formattedAmount = amount.toLocaleString('en-ZA', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
          
          sendMessage(
            PORTFOLIO_MANAGER_THREAD_ID,
            'ai',
            `Done! Your withdrawal of R${formattedAmount} is complete. Your wallet balance has been updated.`
          )
          setScenarioMessagesSent(prev => new Set(prev).add('withdrawal_confirmed'))
          setShowConfirmButton(false)
          
          // Transition to COMPLETED and end scenario
          setTimeout(() => {
            const { setCashFlowState } = useCashFlowStateStore.getState()
            setCashFlowState('COMPLETED')
            endCashWithdrawalScenario()
          }, 100)
        }
      }, 1500) // 1.5 seconds typing delay
    }
  }, [cashFlowState, isCashWithdrawalActive, scenarioMessagesSent, cashWithdrawalScenario, sendMessage, endCashWithdrawalScenario, inboxViewMode])

  // Handlers
  const handleMapClick = useCallback(() => {
    if (activeScenario) {
      const { openMap, setConvertAmount } = useCashFlowStateStore.getState()
      setConvertAmount(activeScenario.amountZAR)
      openMap()
    }
  }, [activeScenario])

  const handleConfirmCashDeposit = useCallback(() => {
    confirmCashDeposit()
    setShowConfirmButton(false)
  }, [confirmCashDeposit])

  const handleConfirmCashWithdrawal = useCallback(() => {
    confirmCashWithdrawal()
    setShowConfirmButton(false)
  }, [confirmCashWithdrawal])

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
            <button 
              className={chatStyles.backButton} 
              onClick={() => {
                // In pre-auth: open sign-in sheet instead of going back
                // In post-auth: normal back behavior
                if (!isAuthed) {
                  openAuthEntrySignup()
                  return
                }
                goBackToInbox()
              }} 
              aria-label="Back"
            >
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
          <div ref={messageAreaRef} className={chatStyles.messageArea}>
            {/* Render messages from store */}
            {pmMessages.map((message, index) => {
              const showDateChip = index === 0
              return (
                <div key={message.id} className={chatStyles.messageWrapper}>
                  {message.from === 'ai' && (
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
                  )}
                  <div className={chatStyles.bubbleContainer}>
                    {message.from === 'ai' ? (
                      <>
                        {isDemoIntro && index === 0 ? (
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
                                    if (!isAuthed) {
                                      openAuthEntrySignup()
                                      return
                                    }
                                  }}
                                  type="button"
                                >
                                  Get Started
                                </button>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className={clsx(chatStyles.messageBubble, chatStyles.agentBubble)}>
                            {message.text.split('\n').map((line, idx) => {
                              // Process line: bold ETA/Distance numbers and make @handles clickable
                              const processedLine = line
                                .replace(/@(\w+)/g, (match, handle) => {
                                  return `<a href="#" class="${chatStyles.agentHandleLink}" onclick="event.preventDefault(); window.handleOpenAgentProfile?.('${handle}'); return false;">${match}</a>`
                                })
                                .replace(/(ETA: )(\d+ minutes?)/g, '$1<strong>$2</strong>')
                                .replace(/(Distance: )([\d.]+ km)/g, '$1<strong>$2</strong>')
                              
                              return (
                                <div key={idx}>
                                  {idx > 0 && <br />}
                                  <span dangerouslySetInnerHTML={{ __html: processedLine }} />
                                </div>
                              )
                            })}
                            {/* Show map inside this bubble if it's the "Great news" message and map should be visible */}
                            {(isCashDepositActive || isCashWithdrawalActive) && 
                             showMapCard && 
                             (message.text.includes('Great news — @skerryy') || message.text.includes('Great news — @skerryy is available')) && (
                              <>
                                <div style={{ marginTop: '14px' }} />
                                <ChatMapEmbed onMapClick={handleMapClick} />
                                {showConfirmButton && (
                                  <>
                                    <div style={{ marginTop: '14px' }} />
                                    <button
                                      className={chatStyles.chatCtaButton}
                                      onClick={isCashDepositActive ? handleConfirmCashDeposit : handleConfirmCashWithdrawal}
                                      type="button"
                                    >
                                      {isCashDepositActive ? 'Confirm cash was deposited' : 'Confirm cash was received'}
                                    </button>
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        )}
                        {message.from === 'ai' && (
                          <div className={chatStyles.timestampRow}>
                            <span className={chatStyles.timestampText}>{message.createdAt}</span>
                            <button
                              type="button"
                              className={chatStyles.iconButton}
                              aria-label="Copy message"
                              onClick={() => console.log('Copy clicked')}
                            >
                              <Copy size={14} />
                            </button>
                            <button
                              type="button"
                              className={chatStyles.iconButton}
                              aria-label="Refresh"
                              onClick={() => console.log('Refresh clicked')}
                            >
                              <RefreshCcw size={14} />
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', width: '100%' }}>
                        <div className={chatStyles.userMessageBubble}>
                          {message.text}
                        </div>
                        <div className={chatStyles.timestamp}>{message.createdAt}</div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
            
            {/* Typing indicator for cash deposit/withdrawal scenario */}
            {(isCashDepositActive || isCashWithdrawalActive) && isTyping && (
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
                  <TypingBubble />
                </div>
              </div>
            )}
            
          </div>

          {/* Input bar */}
          <ChatInputBar
            value={inputText}
            onChange={setInputText}
            onSend={handleSend}
            placeholder="Add a message"
            onRequireAuth={!isAuthed ? openAuthEntrySignup : undefined}
            // No onInputFocus - we don't want scroll on focus, only on message changes
          />
        </div>
      )}
    </ActionSheet>
  )
}


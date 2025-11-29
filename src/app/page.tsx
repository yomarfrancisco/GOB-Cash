'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import CardStack, { type CardStackHandle, type CardType } from '@/components/CardStack'
import TopGlassBar from '@/components/TopGlassBar'
import BottomGlassBar from '@/components/BottomGlassBar'
import DepositSheet from '@/components/DepositSheet'
import WithdrawSheet from '@/components/WithdrawSheet'
import { useTransactSheet } from '@/store/useTransactSheet'
import AmountSheet from '@/components/AmountSheet'
import SendDetailsSheet from '@/components/SendDetailsSheet'
import SuccessSheet from '@/components/SuccessSheet'
import BankTransferDetailsSheet from '@/components/BankTransferDetailsSheet'
import { formatUSDT } from '@/lib/money'
import { useWalletAlloc } from '@/state/walletAlloc'
import { useAiActionCycle } from '@/lib/animations/useAiActionCycle'
import { useRandomCardFlips } from '@/lib/animations/useRandomCardFlips'
import { formatZAR } from '@/lib/formatCurrency'
import { initPortfolioFromAlloc } from '@/lib/portfolio/initPortfolio'
import ConvertCashSection from '@/components/ConvertCashSection'
import BranchManagerFooter from '@/components/BranchManagerFooter'
import AgentListSheet from '@/components/AgentListSheet'
import { useWalletMode } from '@/state/walletMode'
import { ScanOverlay } from '@/components/ScanOverlay'
import { ScanQrSheet } from '@/components/ScanQrSheet'
import WalletHelperSheet from '@/components/WalletHelperSheet'
import MapHelperSheet from '@/components/MapHelperSheet'
import InternalTransferSheet from '@/components/InternalTransferSheet'
import DepositCryptoWalletSheet, { type DepositCryptoWallet } from '@/components/DepositCryptoWalletSheet'
import CryptoDepositAddressSheet from '@/components/CryptoDepositAddressSheet'
import { useNotificationStore } from '@/store/notifications'
import { startDemoNotificationEngine, stopDemoNotificationEngine } from '@/lib/demo/demoNotificationEngine'
import { useAuthStore } from '@/store/auth'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import { useSoundEffect } from '@/hooks/useSoundEffect'
import { getCardDefinition } from '@/lib/cards/cardDefinitions'
import CashMapPopup from '@/components/CashMapPopup'
import ConvertNotificationBanner from '@/components/ConvertNotificationBanner'
import FinancialInboxSheet from '@/components/Inbox/FinancialInboxSheet'
import { openAmaIntro, closeInboxSheet } from '@/lib/demo/autoAmaIntro'
import { useFinancialInboxStore } from '@/state/financialInbox'
import NotificationsSheet from '@/components/notifications/NotificationsSheet'
import { useUserProfileStore } from '@/store/userProfile'
import { openAmaChatWithScenario } from '@/lib/cashDeposit/chatOrchestration'
import { useCashFlowStateStore } from '@/state/cashFlowState'

// Toggle flag to compare both scanner implementations
const USE_MODAL_SCANNER = false // Set to true to use sheet-based scanner, false for full-screen overlay

export default function Home() {
  const [topCardType, setTopCardType] = useState<CardType>('savings')
  const [isHelperOpen, setIsHelperOpen] = useState(false)
  const [helperWalletKey, setHelperWalletKey] = useState<CardType | null>(null)
  const [isMapHelperOpen, setIsMapHelperOpen] = useState(false)
  const cardStackRef = useRef<CardStackHandle>(null)
  const scrollContentRef = useRef<HTMLDivElement | null>(null)
  const { setOnSelect, open } = useTransactSheet()
  const { guardAuthed, isAuthed } = useRequireAuth()
  const { profile } = useUserProfileStore()
  const { startCashDepositScenario, startCashWithdrawalScenario } = useFinancialInboxStore()
  const { isMapOpen, openMap, closeMap, convertAmount, setConvertAmount } = useCashFlowStateStore()
  const { play: playDollarSound } = useSoundEffect('/assets/Drum_3b.mp3')

  // Debug: verify card and map widths match - instrument parent chain
  useEffect(() => {
    const cardShells = document.querySelectorAll('.sectionShell')
    const card = cardShells[0]?.querySelector('.stack') as HTMLElement | null
    const mapCard = cardShells[1]?.querySelector('[id="mapbox-container"]')?.parentElement as HTMLElement | null
    
    if (card && mapCard) {
      const mapParent = mapCard.parentElement as HTMLElement | null
      const mapGrandparent = mapParent?.parentElement as HTMLElement | null
      
      const cardWidth = card.getBoundingClientRect().width
      const mapWidth = mapCard.getBoundingClientRect().width
      
      console.log('CARD width:', cardWidth)
      console.log('MAP  width:', mapWidth)
      console.log('MAP parent width:', mapParent?.getBoundingClientRect().width)
      console.log('MAP grandparent (.sectionShell?) width:', mapGrandparent?.getBoundingClientRect().width)
      
      if (Math.abs(cardWidth - mapWidth) > 1) {
        console.warn('⚠️ Width mismatch! Card vs Map')
      } else {
        console.log('✅ Widths match!')
      }
    }
  }, [])
  const [openDeposit, setOpenDeposit] = useState(false)
  const [openWithdraw, setOpenWithdraw] = useState(false)
  const [openAmount, setOpenAmount] = useState(false)
  const [openDirectPayment, setOpenDirectPayment] = useState(false)
  const [isScannerOpen, setIsScannerOpen] = useState(false)
  const [openSendDetails, setOpenSendDetails] = useState(false)
  const [openSendSuccess, setOpenSendSuccess] = useState(false)
  const [openDepositSuccess, setOpenDepositSuccess] = useState(false)
  const [openCardSuccess, setOpenCardSuccess] = useState(false)
  const [openBankTransferDetails, setOpenBankTransferDetails] = useState(false)
  const [amountMode, setAmountMode] = useState<'deposit' | 'withdraw' | 'send' | 'depositCard' | 'convert'>('deposit')
  const [amountEntryPoint, setAmountEntryPoint] = useState<'helicopter' | 'cashButton' | undefined>(undefined)
  const [sendAmountZAR, setSendAmountZAR] = useState(0)
  const [sendAmountUSDT, setSendAmountUSDT] = useState(0)
  const [depositAmountUSDT, setDepositAmountUSDT] = useState(0)
  const [sendRecipient, setSendRecipient] = useState('')
  const [sendMethod, setSendMethod] = useState<'email' | 'wallet' | 'brics' | null>(null)
  const [flowType, setFlowType] = useState<'payment' | 'transfer'>('payment')
  const [depositAmountZAR, setDepositAmountZAR] = useState(0)
  const [isPaySomeoneFlow, setIsPaySomeoneFlow] = useState(false) // Track if coming from "Pay someone" button
  const [isAgentSheetOpen, setIsAgentSheetOpen] = useState(false)
  const [openInternalTransfer, setOpenInternalTransfer] = useState(false)
  const [transferFromWalletId, setTransferFromWalletId] = useState<'savings' | 'pepe' | 'yield' | 'mzn' | 'btc'>('savings')
  const [transferToWalletId, setTransferToWalletId] = useState<'savings' | 'pepe' | 'yield' | 'mzn' | 'btc'>('pepe')
  const [openDepositCryptoWallet, setOpenDepositCryptoWallet] = useState(false)
  const [selectedCryptoDepositWallet, setSelectedCryptoDepositWallet] = useState<DepositCryptoWallet | null>(null)
  const [showCryptoAddressSheet, setShowCryptoAddressSheet] = useState(false)
  // Convert cash flow state
  const [convertNotificationState, setConvertNotificationState] = useState<{
    type: 'request_sent' | 'request_accepted'
    amount: number
    handle: string
    agentHandle?: string
  } | null>(null)
  const [isAgentCardVisible, setIsAgentCardVisible] = useState(false)

  // Register onSelect handler for global Transact sheet
  useEffect(() => {
    setOnSelect((action) => {
      if (action === 'deposit') {
        setTimeout(() => setOpenDeposit(true), 220)
      } else if (action === 'withdraw') {
        setTimeout(() => setOpenWithdraw(true), 220)
      } else if (action === 'payment') {
        setFlowType('payment')
        setTimeout(() => setOpenDirectPayment(true), 220)
      } else if (action === 'transfer') {
        setFlowType('transfer')
        setAmountMode('send')
        // Map topCardType to walletId for default FROM wallet
        // yieldSurprise maps to 'yield' wallet (reuse yield card wallet)
        const cardTypeToWalletId: Record<CardType, 'savings' | 'pepe' | 'yield' | 'mzn' | 'btc'> = {
          savings: 'savings',
          pepe: 'pepe',
          yield: 'yield',
          mzn: 'mzn',
          btc: 'btc',
          yieldSurprise: 'yield', // Map yieldSurprise to yield wallet
        }
        setTransferFromWalletId(cardTypeToWalletId[topCardType])
        setTimeout(() => setOpenInternalTransfer(true), 220)
      }
    })
    
    return () => {
      setOnSelect(null) // Cleanup on unmount
    }
  }, [setOnSelect])
  const openDepositSheet = useCallback(() => setOpenDeposit(true), [])
  const openDirectPaymentSheet = useCallback(() => setOpenDirectPayment(true), [])
  const closeDirectPayment = useCallback(() => setOpenDirectPayment(false), [])
  const openWithdrawSheet = useCallback(() => setOpenWithdraw(true), [])
  const closeDeposit = useCallback(() => setOpenDeposit(false), [])
  const closeWithdraw = useCallback(() => setOpenWithdraw(false), [])
  const closeAmount = useCallback(() => {
    setOpenAmount(false)
    setAmountEntryPoint(undefined) // Reset entry point when closing
  }, [])
  const closeSendDetails = useCallback(() => {
    setOpenSendDetails(false)
    setIsPaySomeoneFlow(false) // Reset flag when closing
  }, [])
  const closeSendSuccess = useCallback(() => {
    setOpenSendSuccess(false)
    setSendRecipient('')
    setSendAmountZAR(0)
    setSendAmountUSDT(0)
    setFlowType('payment') // Reset to default
  }, [])
  const closeDepositSuccess = useCallback(() => {
    setOpenDepositSuccess(false)
    setDepositAmountZAR(0)
  }, [])
  const closeBankTransferDetails = useCallback(() => {
    setOpenBankTransferDetails(false)
  }, [])
  const closeInternalTransfer = useCallback(() => {
    setOpenInternalTransfer(false)
  }, [])
  const closeDepositCryptoWallet = useCallback(() => {
    setOpenDepositCryptoWallet(false)
  }, [])
  const handleSelectCryptoDepositWallet = useCallback((wallet: DepositCryptoWallet) => {
    setSelectedCryptoDepositWallet(wallet)
    setOpenDepositCryptoWallet(false)
    setTimeout(() => setShowCryptoAddressSheet(true), 220)
  }, [])
  const closeCryptoAddressSheet = useCallback(() => {
    setShowCryptoAddressSheet(false)
    setSelectedCryptoDepositWallet(null)
  }, [])
  const handleTransferNext = useCallback((fromWalletId: 'savings' | 'pepe' | 'yield' | 'mzn' | 'btc', toWalletId: 'savings' | 'pepe' | 'yield' | 'mzn' | 'btc') => {
    setTransferFromWalletId(fromWalletId)
    setTransferToWalletId(toWalletId)
    setOpenInternalTransfer(false)
    setTimeout(() => setOpenAmount(true), 220)
  }, [])

  const handleDirectSelect = useCallback((method: 'bank' | 'card' | 'crypto' | 'email' | 'wallet' | 'brics') => {
    if (method === 'email' || method === 'wallet' || method === 'brics') {
      setAmountMode('send')
      setSendMethod(method)
      setOpenDirectPayment(false)
      setTimeout(() => setOpenAmount(true), 220)
    }
  }, [])

  const handleAmountSubmit = useCallback((amountZAR: number) => {
    if (amountMode === 'send' || flowType === 'transfer') {
      setSendAmountZAR(amountZAR)
      // Calculate USDT amount (using same rate as AmountSheet: 18.1)
      const fxRateZARperUSDT = 18.1
      setSendAmountUSDT(amountZAR / fxRateZARperUSDT)
      setOpenAmount(false)
      
      // For transfers, skip SendDetailsSheet and go directly to success
      if (flowType === 'transfer') {
        // Set recipient to wallet name for display
        const walletNames: Record<'savings' | 'pepe' | 'yield' | 'mzn' | 'btc', string> = {
          savings: 'ZAR wallet',
          pepe: 'PEPE wallet',
          yield: 'ETH wallet',
          mzn: 'MZN wallet',
          btc: 'BTC wallet',
        }
        setSendRecipient(walletNames[transferToWalletId])
        setTimeout(() => setOpenSendSuccess(true), 220)
      } else {
        // For payments, still use SendDetailsSheet
        setTimeout(() => setOpenSendDetails(true), 220)
      }
    }
  }, [amountMode, flowType, transferToWalletId])

  // Get wallet allocation for funds available display
  const { alloc, getCash, getEth, getPepe, setCash, setEth, setPepe } = useWalletAlloc()
  const fundsAvailableZAR = alloc.totalCents / 100
  const formattedFunds = formatZAR(fundsAvailableZAR)

  // Initialize portfolio store from wallet allocation
  useEffect(() => {
    initPortfolioFromAlloc(alloc.cashCents, alloc.ethCents, alloc.pepeCents, alloc.totalCents)
  }, [alloc.cashCents, alloc.ethCents, alloc.pepeCents, alloc.totalCents])

  // Initialize AI action cycle - only run when NOT signed in (autonomous demo behavior)
  // When user signs in, isAuthed becomes true and animations stop
  useAiActionCycle(
    cardStackRef,
    {
      getCash,
      getEth,
      getPepe,
      setCash,
      setEth,
      setPepe,
    },
    !isAuthed // enable only when NOT authenticated
  )

  // Random card flips - only run when NOT authenticated
  // Create controller ref to pause/resume during credit surprise
  const flipControllerRef = useRef<{ pause: () => void; resume: () => void } | null>(null)
  useRandomCardFlips(cardStackRef, flipControllerRef)

  // Credit surprise handler: adds R500 to ETH balance (which yieldSurprise card displays)
  // Note: We use the hook values already available in the component scope
  const handleCreditSurprise = useCallback((amountZAR: number) => {
    const currentZAR = alloc.ethCents / 100
    setEth(currentZAR + amountZAR)
  }, [alloc.ethCents, setEth])

  // TEMPORARY: Test trigger for credit surprise animation
  // TODO: Remove this and wire to actual deposit success event
  useEffect(() => {
    const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
    if (!isDemoMode || isAuthed) return

    // Trigger credit surprise 10 seconds after page load (for testing)
    const timer = setTimeout(() => {
      if (cardStackRef.current) {
        cardStackRef.current.revealCreditSurprise()
      }
    }, 10000)

    return () => clearTimeout(timer)
  }, [isAuthed])

  // Demo notification engine - only run in demo mode AND when NOT authenticated
  const pushNotification = useNotificationStore((state) => state.pushNotification)
  useEffect(() => {
    const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
    
    // Stop demo notifications if user is authenticated
    if (isAuthed) {
      stopDemoNotificationEngine()
      return
    }
    
    if (isDemoMode) {
      // Stub callbacks for map panning and card animations
      const onMapPan = (lat: number, lng: number) => {
        // TODO: Wire up to MapboxMap component for actual panning
        console.log('[Demo] Map pan to:', { lat, lng })
      }

      const onCardAnimation = (type: 'ai_trade' | 'portfolio_rebalanced') => {
        // TODO: Trigger card animation (balance pulse, health bar wiggle)
        console.log('[Demo] Card animation:', type)
      }

      startDemoNotificationEngine(pushNotification, {
        onMapPan,
        onCardAnimation,
      }, isAuthed)

      return () => {
        stopDemoNotificationEngine()
      }
    }
  }, [pushNotification, isAuthed])

  // Auto-show Ama chat intro on landing page (pre-sign-in demo)
  // Shows Ama chat sheet after 5s, keeps it open for 7s, then closes automatically
  const hasShownAmaIntroRef = useRef(false)
  useEffect(() => {
    const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
    
    // Only run once per page load, in demo mode, when not authenticated
    if (!isDemoMode || isAuthed || hasShownAmaIntroRef.current) {
      return
    }
    
    hasShownAmaIntroRef.current = true
    
    let closeTimer: NodeJS.Timeout | null = null
    
    // Wait 15 seconds before showing the intro
    const openTimer = setTimeout(() => {
      // Re-check conditions before opening (user might have signed in)
      const currentIsAuthed = useAuthStore.getState().isAuthed
      if (currentIsAuthed) {
        return // Don't show if user signed in
      }
      
      // Open Ama chat sheet directly (skips inbox list)
      openAmaIntro()
      
      // Close the sheet after 14 seconds
      closeTimer = setTimeout(() => {
        // Check if sheet is still open (user might have closed it manually)
        const { isInboxOpen } = useFinancialInboxStore.getState()
        if (isInboxOpen) {
          closeInboxSheet()
        }
      }, 14000)
    }, 15000)
    
    return () => {
      clearTimeout(openTimer)
      if (closeTimer) {
        clearTimeout(closeTimer)
      }
    }
  }, [isAuthed])

  // After auth, reset scroll *after* keyboard/viewport has settled.
  // This fixes the "home is slightly higher only immediately after sign-in" issue on iOS.
  useEffect(() => {
    if (!isAuthed) return
    
    const resetScroll = () => {
      // Reset outer document scroll
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      }
      
      // Reset inner scroll-content container
      if (scrollContentRef.current) {
        scrollContentRef.current.scrollTo({
          top: 0,
          left: 0,
          behavior: 'auto' as ScrollBehavior,
        })
      }
      
      console.log('[AuthScrollReset] applied – isAuthed:', isAuthed)
    }
    
    // If visualViewport exists (iOS Safari), wait for the keyboard to close
    if (typeof window !== 'undefined' && (window as any).visualViewport) {
      const viewport = (window as any).visualViewport as VisualViewport
      const initialHeight = viewport.height
      let done = false
      
      const handleResize = () => {
        // When the viewport height bounces back up (keyboard dismissed),
        // apply the scroll reset once.
        if (!done && viewport.height >= initialHeight) {
          done = true
          resetScroll()
          viewport.removeEventListener('resize', handleResize)
        }
      }
      
      viewport.addEventListener('resize', handleResize)
      
      // Fallback: in case resize doesn't fire as expected, still reset after a short delay
      const timeout = window.setTimeout(() => {
        if (!done) {
          done = true
          resetScroll()
          viewport.removeEventListener('resize', handleResize)
        }
      }, 700) // ~0.7s feels safe after auth/keyboard transitions
      
      return () => {
        viewport.removeEventListener('resize', handleResize)
        window.clearTimeout(timeout)
      }
    }
    
    // Non-visualViewport environments: just reset after a short delay
    const timeout = window.setTimeout(() => {
      resetScroll()
    }, 300)
    
    return () => {
      window.clearTimeout(timeout)
    }
  }, [isAuthed])

  // Agent card visibility timing - show after map is open
  useEffect(() => {
    if (!isMapOpen) {
      setIsAgentCardVisible(false)
      return
    }
    // Once the map is up, show the agent card a moment later
    const timeout = setTimeout(() => {
      setIsAgentCardVisible(true)
    }, 400) // ~0.4s feels good
    return () => clearTimeout(timeout)
  }, [isMapOpen])

  const handleCloseMapPopup = () => {
    closeMap()
    setIsAgentCardVisible(false)
  }

  // Extract helicopter convert handler for reuse
  const handleHelicopterConvertClick = useCallback(() => {
    guardAuthed(() => {
      // Helicopter button opens convert keypad with single "Convert" button
      setAmountMode('convert')
      setAmountEntryPoint('helicopter')
      setTimeout(() => setOpenAmount(true), 220)
    })
  }, [guardAuthed])

  // Homepage map tap handler - ignores GeolocateControl clicks
  const handleHomeMapClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // If click originated from the Mapbox geolocate control, do nothing.
      const target = e.target as HTMLElement | null
      if (target && target.closest('.mapboxgl-ctrl-geolocate')) {
        // Let Mapbox's GeolocateControl handle this click normally.
        return
      }
      // Otherwise, trigger the helicopter convert flow as before
      handleHelicopterConvertClick()
    },
    [handleHelicopterConvertClick],
  )

  // Get title and subtitle - always use card definitions (same for both modes)
  // Map yieldSurprise to yield for card definition (yieldSurprise reuses yield card config)
  const cardDef = getCardDefinition(topCardType === 'yieldSurprise' ? 'yield' : topCardType)
  // Override title for home page
  const title = `Pay anyone anywhere`
  
  // Subtitle text
  const subtitleText = `Free, private and bankless.`


  return (
    <div className="app-shell">
      <div className="mobile-frame">
        <div className="dashboard-container" style={{ position: 'relative' }}>
          {/* Convert notification banner */}
          <ConvertNotificationBanner
            notification={convertNotificationState}
            onDismiss={() => setConvertNotificationState(null)}
          />

          {/* Overlay: Glass bars only */}
          <div className="overlay-glass">
            <div className="overlay-glass-inner">
              <TopGlassBar onScanClick={() => {
                guardAuthed(() => {
                  setIsScannerOpen(true)
                })
              }} />
              <BottomGlassBar 
                currentPath="/" 
                onDollarClick={() => {
                  // 🔊 Play sound immediately on tap
                  playDollarSound()
                  // NOTE: $ button opens cash-to-crypto keypad with dual "Request" / "Pay someone" buttons
                  guardAuthed(() => {
                    setAmountMode('convert')
                    setAmountEntryPoint('cashButton')
                    setTimeout(() => setOpenAmount(true), 220)
                  })
                }}
              />
            </div>
          </div>

          {/* Scanner - toggle between overlay and sheet implementations */}
          {USE_MODAL_SCANNER ? (
            <ScanQrSheet isOpen={isScannerOpen} onClose={() => {
              setIsScannerOpen(false)
              // Ensure amount sheet stays closed when scanner closes
              setOpenAmount(false)
              setAmountEntryPoint(undefined)
            }} />
          ) : (
            <ScanOverlay isOpen={isScannerOpen} onClose={() => {
              setIsScannerOpen(false)
              // Ensure amount sheet stays closed when scanner closes
              setOpenAmount(false)
              setAmountEntryPoint(undefined)
            }} />
          )}

          {/* Scrollable content */}
          <div ref={scrollContentRef} className="scroll-content">
            <div className="content">
              {/* Card section with shared shell */}
              <div className="sectionShell">
                <div className="frame-parent">
                  <div className="wallet-header">
                    <h1 className="wallet-title">{title}</h1>
                    <div
                      className="help-icon"
                      onClick={() => {
                        // ? info chips remain accessible without auth (read-only information)
                        if (!topCardType) return
                        setHelperWalletKey(topCardType)
                        setIsHelperOpen(true)
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          if (!topCardType) return
                          setHelperWalletKey(topCardType)
                          setIsHelperOpen(true)
                        }
                      }}
                      aria-label="Help"
                    >
                      ?
                    </div>
                  </div>
                  <div className="wallet-subtitle-container">
                    <span className="wallet-subtitle">{subtitleText}</span>
                  </div>
                </div>

                {/* Card Stack */}
                <CardStack 
                  ref={cardStackRef} 
                  onTopCardChange={(cardType: CardType) => {
                    setTopCardType(cardType)
                  }}
                  onCardClick={() => {
                    guardAuthed(() => {
                      // Card click allowed after auth
                    })
                  }}
                  flipControllerRef={flipControllerRef}
                  onCreditSurprise={handleCreditSurprise}
                />
              </div>

              {/* Explore savings circles section with shared shell - directly under .content */}
              <ConvertCashSection 
                onHelpClick={() => setIsMapHelperOpen(true)} 
                onMapClick={handleHomeMapClick}
              />
              <BranchManagerFooter 
                onHelicopterClick={handleHelicopterConvertClick}
                onWhatsAppClick={() => {
                  guardAuthed(() => {
                    setIsAgentSheetOpen(true)
                  })
                }} 
              />

            </div>
          </div>

          {/* Top fade overlay - fades content behind top glass/logo */}
          <div className="content-fade-top" />

          {/* Bottom fade overlay - fades content behind bottom glass nav */}
          <div className="content-fade-bottom" />

        </div>
      </div>

      {/* Sheets */}
      <DepositSheet
        open={openDirectPayment}
        onClose={closeDirectPayment}
        variant="direct-payment"
        onSelect={handleDirectSelect}
      />
      <DepositSheet
        open={openDeposit}
        onClose={closeDeposit}
        variant="deposit"
        onSelect={(method) => {
          setOpenDeposit(false)
          if (method === 'bank') {
            setTimeout(() => setOpenBankTransferDetails(true), 220)
          } else if (method === 'card') {
            setAmountMode('depositCard')
            setTimeout(() => setOpenAmount(true), 220)
          } else if (method === 'crypto') {
            setTimeout(() => setOpenDepositCryptoWallet(true), 220)
          } else {
            setAmountMode('deposit')
            setTimeout(() => setOpenAmount(true), 220)
          }
        }}
      />
      <WithdrawSheet
        open={openWithdraw}
        onClose={closeWithdraw}
        onSelect={(method) => {
          setOpenWithdraw(false)
          setAmountMode('withdraw')
          setAmountEntryPoint(undefined)
          setConvertAmount(0)
          setTimeout(() => setOpenAmount(true), 220)
        }}
      />
      <AmountSheet
        open={openAmount}
        onClose={() => {
          setOpenAmount(false)
          setAmountEntryPoint(undefined) // Reset entry point when closing
        }}
        mode={amountMode}
        withdrawOnly={amountMode === 'withdraw'}
        flowType={flowType}
        balanceZAR={200}
        fxRateZARperUSDT={18.1}
        initialAmount={sendAmountZAR > 0 ? sendAmountZAR : undefined} // Pre-fill amount when returning from SendDetailsSheet
        ctaLabel={amountMode === 'depositCard' ? 'Deposit' : amountMode === 'deposit' ? 'Transfer USDT' : amountMode === 'send' ? (flowType === 'transfer' ? 'Transfer' : 'Send') : 'Continue'}
        showDualButtons={amountMode === 'convert' && !amountEntryPoint} // Legacy support: only if entryPoint not set
        entryPoint={amountEntryPoint}
        onScanClick={amountEntryPoint === 'cashButton' ? () => {
          guardAuthed(() => {
            // 1) Close the keypad sheet first
            setOpenAmount(false)
            setAmountEntryPoint(undefined)
            
            // 2) After the close animation starts, open the scanner
            //    Small timeout (~220ms) to match other sheet transitions
            setTimeout(() => {
              setIsScannerOpen(true)
            }, 220)
          })
        } : undefined}
        onCashSubmit={amountMode === 'convert' ? ({ amountZAR }) => {
          // Cash convert flow: start scenario and open Ama chat instead of map popup
          setConvertAmount(amountZAR)
          // Close keypad modal
          setOpenAmount(false)
          setAmountEntryPoint(undefined)
          
          // Start cash deposit scenario
          startCashDepositScenario(amountZAR)
          
          // Small delay to ensure modals are fully closed, then open Ama chat
          setTimeout(() => {
            openAmaChatWithScenario('cash_deposit')
          }, 220) // Match other modal transitions
        } : undefined}
        onCardSubmit={amountMode === 'convert' ? ({ amountZAR, amountUSDT }) => {
          // Card payment flow ("Pay someone"): close keypad, then show SendDetailsSheet
          setSendAmountZAR(amountZAR)
          setSendAmountUSDT(amountUSDT || 0)
          setDepositAmountZAR(amountZAR) // Also set for card success sheet
          setDepositAmountUSDT(amountUSDT || 0) // Also set for card success sheet
          setSendMethod(null) // Default to email/phone input for "Pay someone"
          setIsPaySomeoneFlow(true) // Mark as "Pay someone" flow
          setOpenAmount(false)
          setAmountEntryPoint(undefined)
          // Open SendDetailsSheet instead of going directly to success
          setTimeout(() => setOpenSendDetails(true), 220)
        } : undefined}
        onHelicopterWithdraw={
          amountMode === 'convert' && amountEntryPoint === 'helicopter'
            ? ({ amountZAR }) => {
                setConvertAmount(amountZAR)
                setOpenAmount(false)
                setAmountEntryPoint(undefined)
                startCashWithdrawalScenario(amountZAR)
                setTimeout(() => {
                  openAmaChatWithScenario('cash_withdrawal')
                }, 220)
              }
            : undefined
        }
        onSubmit={amountMode === 'depositCard' ? ({ amountZAR, amountUSDT }) => {
          setDepositAmountZAR(amountZAR)
          setDepositAmountUSDT(amountUSDT || 0)
          setOpenAmount(false)
          setAmountEntryPoint(undefined)
          setTimeout(() => setOpenCardSuccess(true), 220)
        } : amountMode === 'withdraw' ? ({ amountZAR }) => {
          // Cash withdrawal flow: start scenario and open Ama chat
          setConvertAmount(amountZAR)
          // Close keypad modal
          setOpenAmount(false)
          setAmountEntryPoint(undefined)
          
          // Start cash withdrawal scenario
          startCashWithdrawalScenario(amountZAR)
          
          // Small delay to ensure modals are fully closed, then open Ama chat
          setTimeout(() => {
            openAmaChatWithScenario('cash_withdrawal')
          }, 220) // Match other modal transitions
        } : amountMode !== 'send' && amountMode !== 'convert' ? ({ amountZAR, amountUSDT }) => {
          setOpenAmount(false)
          setAmountEntryPoint(undefined)
          console.log('Amount chosen', { amountZAR, amountUSDT, mode: amountMode })
        } : undefined}
        onAmountSubmit={(amountMode === 'send' || flowType === 'transfer') ? handleAmountSubmit : undefined}
      />
      <SendDetailsSheet
        open={openSendDetails}
        onClose={closeSendDetails}
        amountZAR={sendAmountZAR}
        amountUSDT={sendAmountUSDT}
        sendMethod={sendMethod}
        flowType={flowType}
        onBackToAmount={isPaySomeoneFlow ? () => {
          // Back chevron: return to keypad with same amount and mode
          setOpenSendDetails(false)
          // Reopen AmountSheet with preserved state
          setAmountMode('convert')
          setAmountEntryPoint('cashButton')
          setTimeout(() => setOpenAmount(true), 220)
        } : undefined}
        onPay={(payload) => {
          console.log('PAY', payload)
          setOpenSendDetails(false)
          
          // If coming from "Pay someone" flow, use card success sheet
          if (isPaySomeoneFlow) {
            setIsPaySomeoneFlow(false) // Reset flag
            setTimeout(() => setOpenCardSuccess(true), 220)
          } else {
            // Regular send flow
            setSendRecipient(payload.to)
            setTimeout(() => setOpenSendSuccess(true), 220)
          }
          // Note: notification is emitted in SuccessSheet when it opens
        }}
      />
      <SuccessSheet
        open={openSendSuccess}
        onClose={closeSendSuccess}
        amountZAR={sendMethod === 'wallet' ? formatUSDT(sendAmountUSDT) : `R ${sendAmountZAR.toLocaleString('en-ZA', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`}
        recipient={sendRecipient}
        kind="send"
        flowType={flowType}
      />
      <SuccessSheet
        open={openDepositSuccess}
        onClose={closeDepositSuccess}
        amountZAR={`R ${depositAmountZAR.toLocaleString('en-ZA', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`}
        recipient=""
        kind="deposit"
      />
      <SuccessSheet
        open={openCardSuccess}
        onClose={() => {
          setOpenCardSuccess(false)
          setDepositAmountZAR(0)
          setDepositAmountUSDT(0)
        }}
        amountZAR={`R ${depositAmountZAR.toLocaleString('en-ZA', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`}
        amountUSDT={depositAmountUSDT > 0 ? formatUSDT(depositAmountUSDT) : undefined}
        recipient=""
        kind="card"
      />
      <BankTransferDetailsSheet
        open={openBankTransferDetails}
        onClose={closeBankTransferDetails}
      />
              <CashMapPopup
                open={isMapOpen}
                onClose={handleCloseMapPopup}
                amount={convertAmount}
                showAgentCard={isAgentCardVisible}
                onComplete={() => {
                  // Reset convert flow state when deposit is completed
                  setConvertAmount(0)
                  setConvertNotificationState(null)
                }}
              />
      <AgentListSheet
        open={isAgentSheetOpen}
        onClose={() => setIsAgentSheetOpen(false)}
      />
      <WalletHelperSheet
        walletKey={helperWalletKey}
        onClose={() => {
          setIsHelperOpen(false)
          setHelperWalletKey(null)
        }}
      />
      <MapHelperSheet
        isOpen={isMapHelperOpen}
        onClose={() => setIsMapHelperOpen(false)}
      />
      <InternalTransferSheet
        open={openInternalTransfer}
        onClose={closeInternalTransfer}
        onNext={handleTransferNext}
        defaultFromWalletId={transferFromWalletId}
      />
      <DepositCryptoWalletSheet
        open={openDepositCryptoWallet}
        onClose={closeDepositCryptoWallet}
        onSelectCryptoDepositWallet={handleSelectCryptoDepositWallet}
      />
      {selectedCryptoDepositWallet && (
        <CryptoDepositAddressSheet
          open={showCryptoAddressSheet}
          onClose={closeCryptoAddressSheet}
          wallet={selectedCryptoDepositWallet}
        />
      )}
      <FinancialInboxSheet />
      <NotificationsSheet />
    </div>
  )
}

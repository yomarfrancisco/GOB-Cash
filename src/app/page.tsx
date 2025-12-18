'use client'

import { useState, useCallback, useRef, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import CardStack, { type CardStackHandle, type CardType } from '@/components/CardStack'
import TopGlassBar from '@/components/TopGlassBar'
import BottomGlassBar from '@/components/BottomGlassBar'
import DepositSheet from '@/components/DepositSheet'
import WithdrawSheet from '@/components/WithdrawSheet'
import WithdrawTronUsdtSheet from '@/components/WithdrawTronUsdtSheet'
import WithdrawCryptoAddressSheet from '@/components/WithdrawCryptoAddressSheet'
import { useTransactSheet } from '@/store/useTransactSheet'
import AmountSheet from '@/components/AmountSheet'
import SendDetailsSheet from '@/components/SendDetailsSheet'
import SuccessSheet from '@/components/SuccessSheet'
import { formatUSDT, formatZAR } from '@/lib/money'
import { useWalletAlloc } from '@/state/walletAlloc'
import { useWalletStore } from '@/store/wallets'
import { useAppModeStore } from '@/store/appMode'
import { useAiActionCycle } from '@/lib/animations/useAiActionCycle'
import { useRandomCardFlips } from '@/lib/animations/useRandomCardFlips'
import { initPortfolioFromAlloc } from '@/lib/portfolio/initPortfolio'
import ConvertCashSection from '@/components/ConvertCashSection'
import BranchManagerFooter from '@/components/BranchManagerFooter'
import { useUserProfileStore } from '@/store/userProfile'
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
import HomeStreamSection from '@/components/HomeStreamSection'
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
import { openAmaChatWithScenario } from '@/lib/cashDeposit/chatOrchestration'
import { usePaymentDetailsSheet } from '@/store/usePaymentDetailsSheet'
import { useBankingDetailsSheet } from '@/store/useBankingDetailsSheet'
import { useCashFlowStateStore } from '@/state/cashFlowState'
import { useSearchSheet } from '@/store/useSearchSheet'
import { prefetchActionSheetIcons } from '@/lib/prefetchActionSheetIcons'

// Toggle flag to compare both scanner implementations
const USE_MODAL_SCANNER = false // Set to true to use sheet-based scanner, false for full-screen overlay

// Inner component that uses search params (must be wrapped in Suspense)
function HomeWithSearchParams() {
  const searchParams = useSearchParams()
  const { open: openSearch } = useSearchSheet()

  // Auto-open search sheet when searchOpen=1 query param is present
  useEffect(() => {
    const shouldOpenSearch = searchParams?.get('searchOpen') === '1'
    if (shouldOpenSearch) {
      openSearch()
      // Clear the query param from URL without reload
      const url = new URL(window.location.href)
      url.searchParams.delete('searchOpen')
      window.history.replaceState({}, '', url.toString())
    }
  }, [searchParams, openSearch])

  return <HomeContent />
}

// Main home page content
function HomeContent() {
  const [topCardType, setTopCardType] = useState<CardType>('savings')
  const [isHelperOpen, setIsHelperOpen] = useState(false)
  const [helperWalletKey, setHelperWalletKey] = useState<CardType | null>(null)
  const [isMapHelperOpen, setIsMapHelperOpen] = useState(false)
  const cardStackRef = useRef<CardStackHandle>(null)
  const scrollContentRef = useRef<HTMLDivElement | null>(null)
  const { setOnSelect, open } = useTransactSheet()
  const { guardAuthed, isAuthed, requireAuth } = useRequireAuth()
  const { profile } = useUserProfileStore()
  const { startCashDepositScenario, startCashWithdrawalScenario } = useFinancialInboxStore()
  const { open: openPaymentDetails, close: closePaymentDetails } = usePaymentDetailsSheet()
  const { isMapOpen, openMap, closeMap, convertAmount, setConvertAmount } = useCashFlowStateStore()
  const { play: playDollarSound } = useSoundEffect('/assets/Drum_3b.mp3')
  const { open: openSearch } = useSearchSheet()

  // Prefetch ActionSheet icons on page load
  useEffect(() => {
    prefetchActionSheetIcons()
  }, [])

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

  const [openWithdraw, setOpenWithdraw] = useState(false)
  const [openWithdrawTronUsdt, setOpenWithdrawTronUsdt] = useState(false)
  const [openWithdrawCryptoAddress, setOpenWithdrawCryptoAddress] = useState(false)
  const [withdrawCryptoAmountUSDT, setWithdrawCryptoAmountUSDT] = useState(0)
  const [openAmount, setOpenAmount] = useState(false)
  const [openDirectPayment, setOpenDirectPayment] = useState(false)
  const [isScannerOpen, setIsScannerOpen] = useState(false)
  const [openSendDetails, setOpenSendDetails] = useState(false)
  const [openSendSuccess, setOpenSendSuccess] = useState(false)
  const [openCardSuccess, setOpenCardSuccess] = useState(false)
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
  const [transferFromWalletId, setTransferFromWalletId] = useState<'savings' | 'zwd' | 'yield' | 'mzn' | 'btc'>('savings')
  const [transferToWalletId, setTransferToWalletId] = useState<'savings' | 'zwd' | 'yield' | 'mzn' | 'btc'>('zwd')
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
      if (action === 'withdraw') {
        setTimeout(() => setOpenWithdraw(true), 220)
      } else if (action === 'payment') {
        setFlowType('payment')
        setTimeout(() => setOpenDirectPayment(true), 220)
      } else if (action === 'transfer') {
        setFlowType('transfer')
        setAmountMode('send')
        // Map topCardType to walletId for default FROM wallet
        // yieldSurprise maps to 'yield' wallet (reuse yield card wallet)
        const cardTypeToWalletId: Record<CardType, 'savings' | 'zwd' | 'yield' | 'mzn' | 'btc'> = {
          savings: 'savings',
          zwd: 'zwd',
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
  const openDirectPaymentSheet = useCallback(() => setOpenDirectPayment(true), [])
  const closeDirectPayment = useCallback(() => setOpenDirectPayment(false), [])
  const openWithdrawSheet = useCallback(() => setOpenWithdraw(true), [])
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
  const handleTransferNext = useCallback((fromWalletId: 'savings' | 'zwd' | 'yield' | 'mzn' | 'btc', toWalletId: 'savings' | 'zwd' | 'yield' | 'mzn' | 'btc') => {
    setTransferFromWalletId(fromWalletId)
    setTransferToWalletId(toWalletId)
    setOpenInternalTransfer(false)
    setTimeout(() => setOpenAmount(true), 220)
  }, [])

  const handleDirectSelect = useCallback((method: 'bank' | 'card' | 'crypto' | 'email' | 'wallet' | 'brics' | 'atm' | 'agent') => {
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
        const walletNames: Record<'savings' | 'zwd' | 'yield' | 'mzn' | 'btc', string> = {
          savings: 'ZAR wallet',
          zwd: 'ZWD wallet',
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

  // Get wallet allocation for funds available display (demo fallback)
  const { alloc, getCash, getEth, getZwd, setCash, setEth, setZwd, syncFromWallets } = useWalletAlloc()
  const { wallets, demoMode, walletsHydrated } = useWalletStore()
  const isBalanceReady = useAppModeStore((state) => state.isBalanceReady())

  // Sync WalletAlloc from wallet docs when they change (only if user is authenticated)
  useEffect(() => {
    if (isAuthed && wallets) {
      syncFromWallets(wallets as any)
    }
  }, [isAuthed, wallets, syncFromWallets])

  // Freeze at 0 until isBalanceReady (authState === 'authed' && walletsHydrated === true)
  // This prevents demo/animated balances from showing in the header
  // Option A: fiatBalance only (lockedBalance shown separately if needed)
  let fundsAvailableZAR: number
  if (isAuthed && !isBalanceReady) {
    // Not ready yet: show 0 (freeze until Firestore arrives)
    fundsAvailableZAR = 0
    if (process.env.NODE_ENV !== 'production') {
      console.log('[BALANCE_READY] Header balance forced to 0 (waiting for hydration)', {
        isBalanceReady,
        walletsHydrated,
      })
    }
  } else if (isAuthed && isBalanceReady) {
    // Ready: use Firestore balance (fiatBalance only, no lockedBalance)
    fundsAvailableZAR = (wallets as any)?.cashZAR?.fiatBalance ?? 0
  } else {
    // Unauthed: allow demo values
    fundsAvailableZAR = (wallets as any)?.cashZAR?.fiatBalance ?? alloc.totalCents / 100
  }
  const formattedFunds = formatZAR(fundsAvailableZAR)
  // Log source of balances (Firestore for authenticated users, demo for unauthenticated)
  if (isAuthed && wallets && !demoMode) {
    console.log('[Wallet] Using Firestore wallets:', wallets)
  } else {
    console.log('[Wallet] Using demo wallets (totalCents):', alloc.totalCents)
  }

  // Initialize portfolio store from wallet allocation
  // Only initialize if isBalanceReady (prevents demo values from being used post-auth)
  // Portfolio demo initial values are only used when authState === 'unauthed'
  useEffect(() => {
    if (isBalanceReady && wallets && !demoMode) {
      // Ready: initialize from Firestore data (alloc synced from wallets)
      initPortfolioFromAlloc(alloc.cashCents, alloc.ethCents, alloc.zwdCents, alloc.totalCents)
    } else if (!isAuthed) {
      // Pre-auth: use demo values for portfolio (authState === 'unauthed')
      initPortfolioFromAlloc(alloc.cashCents, alloc.ethCents, alloc.zwdCents, alloc.totalCents)
    }
    // If authed but not ready yet, don't initialize (will initialize after syncFromWallets)
  }, [alloc.cashCents, alloc.ethCents, alloc.zwdCents, alloc.totalCents, isBalanceReady, isAuthed, wallets, demoMode])

  // Initialize AI action cycle - only run when NOT signed in (autonomous demo behavior)
  // When user signs in, isAuthed becomes true and animations stop
  // Create controller ref to pause/resume during earnings surprise
  const aiCycleControllerRef = useRef<{ pause: () => void; resume: () => void } | null>(null)
  const authState = useAuthStore((state) => state.getAuthState())
  // CRITICAL: Only enable demo animations when authState === 'unauthed'
  // This prevents animations from starting during loading or when authenticated
  const aiCycle = useAiActionCycle(
    cardStackRef,
    {
      getCash,
      getEth,
      getZwd,
      setCash,
      setEth,
      setZwd,
    },
    authState === 'unauthed' // enable only when explicitly unauthed (not loading, not authed)
  )
  // Store pause/resume in ref for CardStack to access
  aiCycleControllerRef.current = { pause: aiCycle.pause, resume: aiCycle.resume }

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

  // Demo notification engine - run when NOT authenticated (regardless of demo mode setting)
  const pushNotification = useNotificationStore((state) => state.pushNotification)
  useEffect(() => {
    // Stop demo notifications if user is authenticated
    if (isAuthed) {
      stopDemoNotificationEngine()
      return
    }
    
    // Run demo notifications for unauthenticated users (demo mode ON or OFF)
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
  }, [pushNotification, isAuthed])

  // Auto-show Ama chat intro on landing page (pre-sign-in)
  // Shows Ama chat sheet after 50s, keeps it open for 14s, then closes automatically
  // Hard block: if auth flow starts, never show the chat intro for this page view
  const hasShownAmaIntroRef = useRef(false)
  useEffect(() => {
    const authState = useAuthStore.getState()
    // Check if any auth sheet is open (entry, password, or phone signup)
    const isAuthFlowActive = authState.authEntryOpen || authState.authPasswordOpen || authState.phoneSignupOpen
    
    // If user authed, intro already used, or auth flow already active → bail
    if (isAuthed || hasShownAmaIntroRef.current || isAuthFlowActive) {
      return
    }
    
    hasShownAmaIntroRef.current = true
    
    const OPEN_DELAY_MS = 100000 // 100 seconds (doubled from 50 seconds)
    const AUTO_CLOSE_DELAY_MS = 14000 // 14 seconds
    
    let openTimer: ReturnType<typeof setTimeout> | undefined
    let closeTimer: ReturnType<typeof setTimeout> | undefined
    
    const cancelTimersAndLock = () => {
      if (openTimer) {
        clearTimeout(openTimer)
        openTimer = undefined
      }
      if (closeTimer) {
        clearTimeout(closeTimer)
        closeTimer = undefined
      }
      // Once auth flow starts, never show Ama intro on this page view
      hasShownAmaIntroRef.current = true
    }
    
    // 🔔 Subscribe to auth popup state – if any auth sheet opens, kill the chat timers
    const unsubscribeAuth = useAuthStore.subscribe(
      (state) => {
        // Cancel if any auth sheet opens (entry, password, or phone signup)
        if (state.authEntryOpen || state.authPasswordOpen || state.phoneSignupOpen) {
          cancelTimersAndLock()
        }
      }
    )
    
    // ⏲️ Schedule Ama intro after 100s, with final guards
    openTimer = setTimeout(() => {
      const currentAuthState = useAuthStore.getState()
      const currentIsAuthed = currentAuthState.isAuthed
      // Check if any auth sheet is open
      const currentIsAuthFlowActive = currentAuthState.authEntryOpen || currentAuthState.authPasswordOpen || currentAuthState.phoneSignupOpen
      
      if (currentIsAuthed || currentIsAuthFlowActive) {
        cancelTimersAndLock()
        return
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
      }, AUTO_CLOSE_DELAY_MS)
    }, OPEN_DELAY_MS)
    
    return () => {
      cancelTimersAndLock()
      unsubscribeAuth()
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
  // Title - conditional based on auth status
  const title = isAuthed ? `Cash wallet` : `Cash wallet`
  
  // Subtitle text - conditional based on auth status
  const totalBalanceZAR = isAuthed ? ((wallets as any)?.cashZAR?.fiatBalance ?? alloc.totalCents / 100) : 0
  const formattedBalance = formatZAR(totalBalanceZAR || 0)
  const subtitleText = isAuthed 
    ? `${formattedBalance} available`
    : `Pay anyone anywhere. Free. Private.`


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
                  // NOTE: $ button opens cash-to-crypto keypad with dual "Request" / "Pay someone" buttons
                  const openAmountSheet = () => {
                    setAmountMode('convert')
                    setAmountEntryPoint('cashButton')
                    playDollarSound()
                    setTimeout(() => setOpenAmount(true), 220)
                  }

                  // If not authed, go through requireAuth and ONLY open the sheet after success
                  if (!isAuthed) {
                    requireAuth(() => {
                      openAmountSheet()
                    })
                    return
                  }

                  // If already authed, just open the sheet immediately
                  openAmountSheet()
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
                  aiCycleControllerRef={aiCycleControllerRef}
                  onCreditSurprise={handleCreditSurprise}
                  onApyPillClick={(cardType: CardType) => {
                    setHelperWalletKey(cardType)
                    setIsHelperOpen(true)
                  }}
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
              <HomeStreamSection />

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
      <WithdrawSheet
        open={openWithdraw}
        onClose={closeWithdraw}
        onBack={amountMode === 'withdraw' ? () => {
          setOpenWithdraw(false)
          setTimeout(() => setOpenAmount(true), 220)
        } : undefined}
        onSelect={(method) => {
          console.log('[WithdrawSheet] onSelect called with method:', method, 'amountUSDT:', withdrawCryptoAmountUSDT)
          if (method === 'crypto') {
            // Open crypto address modal
            // If amountUSDT is 0, we need to get it from the last amount entered
            // This can happen if user came from deposit keypad flow
            if (withdrawCryptoAmountUSDT === 0) {
              console.warn('[WithdrawSheet] withdrawCryptoAmountUSDT is 0, cannot proceed with crypto withdrawal')
              // TODO: Could try to get amount from depositAmountUSDT or other state
              // For now, we'll let the backend handle validation
            }
            console.log('[WithdrawSheet] Opening crypto address sheet, amountUSDT:', withdrawCryptoAmountUSDT)
            setOpenWithdraw(false)
            setTimeout(() => {
              console.log('[WithdrawSheet] Setting openWithdrawCryptoAddress to true')
              setOpenWithdrawCryptoAddress(true)
            }, 220)
          } else if (method === 'bank') {
            // Open Banking Details sheet (same as linked accounts)
            setOpenWithdraw(false)
            const { open: openBankingDetails } = useBankingDetailsSheet.getState()
            setTimeout(() => {
              openBankingDetails('create', null)
            }, 220)
          } else {
            setOpenWithdraw(false)
            setAmountMode('withdraw')
            setAmountEntryPoint(undefined)
            setConvertAmount(0)
            setTimeout(() => setOpenAmount(true), 220)
          }
        }}
      />
      <WithdrawTronUsdtSheet
        open={openWithdrawTronUsdt}
        onClose={() => setOpenWithdrawTronUsdt(false)}
        onBack={() => {
          setOpenWithdrawTronUsdt(false)
          setOpenWithdraw(true)
        }}
        onSuccess={(result) => {
          // Show success message or notification
          const { pushNotification } = useNotificationStore.getState()
          // Hard fail mode: always full fill or failure
          pushNotification({
            kind: 'transfer',
            title: 'USDT Withdrawal Sent',
            body: `${result.sentAmountUSDT.toFixed(6)} USDT sent to TRON address${result.txId ? ` (TxID: ${result.txId.slice(0, 8)}...)` : ''}`,
            amount: {
              currency: 'USDT',
              value: result.sentAmountUSDT,
            },
            direction: 'down',
            actor: { type: 'system', name: 'GoBankless' },
          })
        }}
      />
      <WithdrawCryptoAddressSheet
        open={openWithdrawCryptoAddress}
        onClose={() => setOpenWithdrawCryptoAddress(false)}
        onBack={() => {
          setOpenWithdrawCryptoAddress(false)
          setTimeout(() => setOpenWithdraw(true), 220)
        }}
        onSubmit={async (address, network) => {
          const { pushNotification } = useNotificationStore.getState()
          const { tx_withdrawTronUSDT } = await import('@/lib/transactions/clientFunctions')
          const { generateRequestId } = await import('@/lib/utils/requestId')
          
          // Generate requestId for idempotency
          const requestId = generateRequestId()
          
          try {
            const result = await tx_withdrawTronUSDT({
              toAddress: address,
              amountUSDT: withdrawCryptoAmountUSDT,
              requestId,
            })
            
            // Success notification
            pushNotification({
              kind: 'transfer',
              title: 'USDT Withdrawal Sent',
              body: `${result.sentAmountUSDT.toFixed(6)} USDT sent to TRON address${result.txId ? ` (TxID: ${result.txId.slice(0, 8)}...)` : ''}`,
              amount: {
                currency: 'USDT',
                value: result.sentAmountUSDT,
              },
              direction: 'down',
              actor: { type: 'system', name: 'GoBankless' },
            })
            
            setOpenWithdrawCryptoAddress(false)
            // Balance updates automatically via Firestore subscription
          } catch (error: any) {
            // Log full error for debugging
            console.error('[WithdrawCryptoAddressSheet] Error details:', {
              code: error?.code,
              message: error?.message,
              details: error?.details,
              stack: error?.stack,
            })

            // Map Firebase error codes to user-friendly messages
            // Show "Not allowed" for failed-precondition, "Server error" for internal
            if (error?.code === 'functions/failed-precondition') {
              if (error.message?.includes('Insufficient treasury') || error.message?.includes('treasury') || error.message?.includes('Treasury')) {
                throw new Error(`Not allowed: Treasury has insufficient balance. Requested ${withdrawCryptoAmountUSDT.toFixed(6)} USDT.`)
              } else if (error.message?.includes('Insufficient user balance') || error.message?.includes('user balance') || error.message?.includes('Insufficient balance')) {
                throw new Error('Not allowed: Insufficient USDT balance. Please check your balance and try again.')
              } else if (error.message?.includes('in progress') || error.message?.includes('already in progress')) {
                throw new Error('Not allowed: Withdrawal already in progress. Please wait and try again.')
              } else if (error.message?.includes('Invalid TRON address') || error.message?.includes('Invalid address')) {
                throw new Error('Not allowed: Invalid TRON address format.')
              } else {
                // Generic failed-precondition
                throw new Error(`Not allowed: ${error.message || 'Withdrawal cannot be processed at this time.'}`)
              }
            } else if (error?.code === 'functions/invalid-argument') {
              throw new Error(`Not allowed: ${error.message || 'Invalid request parameters.'}`)
            } else if (error?.code === 'functions/internal') {
              if (error.message?.includes('broadcast') || error.message?.includes('Broadcast')) {
                throw new Error('Server error: Transaction failed to broadcast. Please try again or contact support.')
              } else {
                throw new Error(`Server error: ${error.message || 'Withdrawal could not be processed. Please try again.'}`)
              }
            } else if (error?.code === 'functions/unauthenticated') {
              throw new Error('Not allowed: You must be logged in to withdraw.')
            } else if (error?.code === 'functions/permission-denied') {
              throw new Error('Not allowed: You do not have permission to perform this action.')
            } else if (error?.message?.includes('CORS') || error?.message?.includes('cors')) {
              // CORS error should not happen with httpsCallable, but handle it if it does
              console.error('[WithdrawCryptoAddressSheet] CORS error detected - this should not happen with httpsCallable')
              throw new Error('Network error: Please check your connection and try again.')
            } else {
              // Unknown error - show generic message but log full details
              throw new Error(`Error: ${error?.message || 'Failed to process withdrawal. Please try again.'}`)
            }
          }
        }}
        amountUSDT={withdrawCryptoAmountUSDT}
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
        onCashSubmit={amountMode === 'convert' && amountEntryPoint === 'cashButton' ? ({ amountZAR }) => {
          // Cash button flow ("Request"): open PaymentDetailsSheet
          setOpenAmount(false)
          setAmountEntryPoint(undefined)
          setTimeout(() => {
            openPaymentDetails('request', amountZAR)
          }, 220)
        } : amountMode === 'convert' ? ({ amountZAR }) => {
          // Legacy cash convert flow (helicopter): start scenario and open Ama chat
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
        onCardSubmit={amountMode === 'convert' && amountEntryPoint === 'cashButton' ? ({ amountZAR, amountUSDT }) => {
          // Cash button flow ("Pay someone"): open PaymentDetailsSheet
          setOpenAmount(false)
          setAmountEntryPoint(undefined)
          setTimeout(() => {
            openPaymentDetails('pay', amountZAR)
          }, 220)
        } : amountMode === 'convert' ? ({ amountZAR, amountUSDT }) => {
          // Legacy card payment flow: close keypad, then show SendDetailsSheet
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
        onSubmit={amountMode === 'withdraw' ? ({ amountZAR, amountUSDT }) => {
          // Store USDT amount for crypto withdrawal
          if (amountUSDT) {
            setWithdrawCryptoAmountUSDT(amountUSDT)
          }
          // Close keypad and open withdraw method sheet
          setOpenAmount(false)
          setAmountEntryPoint(undefined)
          setTimeout(() => setOpenWithdraw(true), 220)
        } : amountMode !== 'send' && amountMode !== 'convert' ? ({ amountZAR, amountUSDT }) => {
          // Store amount even in deposit mode, in case user navigates to withdraw
          // This handles the case where user enters amount in deposit keypad, then opens WithdrawSheet
          if (amountUSDT) {
            setWithdrawCryptoAmountUSDT(amountUSDT)
            setDepositAmountUSDT(amountUSDT) // Also store for deposit flow
          }
          if (amountZAR) {
            setDepositAmountZAR(amountZAR)
          }
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

// Default export wraps in Suspense for useSearchParams
export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeWithSearchParams />
    </Suspense>
  )
}

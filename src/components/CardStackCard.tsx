'use client'

import Image from 'next/image'
import type { StaticImageData } from 'next/image'
import { useRef, useEffect, useState, useMemo } from 'react'
import SlotCounter from './SlotCounter'
import { formatZAR, formatUSDT as formatConvertedAmount } from '@/lib/formatCurrency'
import { mznToZar, zarToMzn, quotedMznPerZarForDestination } from '@/lib/mznZar'
import { useWalletAlloc } from '@/state/walletAlloc'
import { useWalletStore } from '@/store/wallets'
import { useAuthStore } from '@/store/auth'
import { useAppModeStore } from '@/store/appMode'
import { usePortfolioStore } from '@/store/portfolio'
import { useTweenNumber } from '@/lib/animations/useTweenNumber'
import { useTwoStageTween } from '@/lib/animations/useTwoStageTween'
import clsx from 'clsx'
import { getCardDefinition } from '@/lib/cards/cardDefinitions'
import { BASE_USDT_ADDRESS } from '@/config/addresses'
import { useNotificationStore } from '@/store/notifications'
import type { FxRates } from '@/lib/exchangeRates/useFxRates'
import { applyFeeToRate } from '@/lib/exchangeRates/applyFeeToRate'

const FX_USD_ZAR_DEFAULT = 18.1

function getSecondsUntil17hReset(): number {
  const now = new Date()
  const next = new Date(now)
  next.setHours(17, 0, 0, 0)
  if (now.getTime() >= next.getTime()) {
    next.setDate(next.getDate() + 1)
  }
  return Math.max(0, Math.floor((next.getTime() - now.getTime()) / 1000))
}

type CardType = 'zwd' | 'savings' | 'yield' | 'mzn' | 'btc' | 'yieldSurprise'

type HealthLevel = 'good' | 'moderate' | 'caution' | 'fragile'

const HEALTH_CONFIG: Record<CardType, { level: HealthLevel; percent: number }> = {
  savings: { level: 'good', percent: 100 },
  zwd: { level: 'good', percent: 100 },
  yield: { level: 'moderate', percent: 60 },
  mzn: { level: 'good', percent: 100 },
  btc: { level: 'moderate', percent: 15 },
  yieldSurprise: { level: 'moderate', percent: 60 }, // Reuse yield card health config
}

// Derive health level from percent value
function getHealthLevel(percent: number): HealthLevel {
  if (percent >= 80) return 'good'
  if (percent >= 50) return 'moderate'
  if (percent >= 25) return 'caution'
  return 'fragile'
}

// Dynamic status labels based on health level
const HEALTH_STATUS: Record<HealthLevel, string> = {
  good: 'All clear',
  moderate: 'Watching closely',
  caution: 'Moved to safety',
  fragile: 'High risk',
}

const CARD_TO_ALLOC_KEY: Record<CardType, 'cashCents' | 'ethCents' | 'zwdCents' | 'mznCents' | 'btcCents' | 'earningsCents'> = {
  savings: 'cashCents',
  zwd: 'zwdCents',
  yield: 'ethCents',
  mzn: 'mznCents',
  btc: 'btcCents',
  yieldSurprise: 'earningsCents',
}

const CARD_TO_SYMBOL: Record<CardType, 'CASH' | 'ETH' | 'ZWD' | 'MZN' | 'BTC' | 'USD'> = {
  savings: 'CASH',
  zwd: 'USD',
  yield: 'ETH',
  mzn: 'MZN',
  btc: 'BTC',
  yieldSurprise: 'MZN',
}

// Flag mapping by currency
const FLAG_BY_CCY: Record<string, { src: string; id: string }> = {
  ZAR: { src: '/assets/south%20africa.svg', id: 'flag-za' },
  MZN: { src: '/assets/mozambique.svg', id: 'flag-mz' },
  ZWD: { src: '/assets/zimbabwe.png', id: 'flag-zw' },
  USD: { src: '/assets/united_states.png', id: 'flag-us' },
}

// Coin mapping for crypto cards
const COIN_BY_CARD: Record<CardType, { src: string; id: string; label: string } | null> = {
  savings: null, // Uses flag
  zwd: null, // Uses flag (ZWD)
  yield: { src: '/assets/eth_coin.png', id: 'coin-eth', label: 'ETH' },
  mzn: null, // Uses flag
  btc: { src: '/assets/Bitcoin-Logo.png', id: 'coin-btc', label: 'BTC' },
  yieldSurprise: null, // Uses Mozambique flag
}

// Determine currency for card type (for flags)
const getCardCurrency = (cardType: CardType): string | null => {
  if (cardType === 'savings') return 'ZAR'
  if (cardType === 'mzn' || cardType === 'yieldSurprise') return 'MZN'
  if (cardType === 'zwd') return 'USD'
  return null // yield and btc use coin badges instead
}

type CardStackCardProps = {
  card: {
    type: CardType
    image: string | StaticImageData
    alt: string
    width: number
    height: number
  }
  index: number
  position: number
  depth: number
  total: number
  isTop: boolean
  className: string
  onClick: () => void
  onTouchStart: (e: React.TouchEvent) => void
  onTouchEnd: (e: React.TouchEvent) => void
  style: React.CSSProperties
  flashDirection: 'up' | 'down' | null
  onFlashEnd: () => void
  isSpecialMode?: boolean
  isSpecialCard?: boolean
  onApyPillClick?: (cardType: CardType) => void
  fxRates?: FxRates | null // Exchange rates from server
}

export default function CardStackCard({
  card,
  index,
  position,
  depth,
  total,
  isTop,
  className,
  onClick,
  onTouchStart,
  onTouchEnd,
  style,
  flashDirection,
  onFlashEnd,
  isSpecialMode = false,
  isSpecialCard = false,
  onApyPillClick,
  fxRates,
}: CardStackCardProps) {
  const { alloc, allocPct } = useWalletAlloc()
  const pushNotification = useNotificationStore((state) => state.pushNotification)

  // Long-press detection for copying USDT address
  const longPressTimeoutRef = useRef<number | null>(null)
  const longPressActiveRef = useRef(false)
  const pressStartRef = useRef<number | null>(null)
  const hasLongPressAttemptRef = useRef(false)

  const cancelLongPress = () => {
    longPressActiveRef.current = false
    pressStartRef.current = null
    hasLongPressAttemptRef.current = false
    if (longPressTimeoutRef.current !== null) {
      window.clearTimeout(longPressTimeoutRef.current)
      longPressTimeoutRef.current = null
    }
  }

  const handlePressStart = (e?: React.TouchEvent | React.MouseEvent) => {
    // Only allow for the top card
    if (!isTop) return
    if (!BASE_USDT_ADDRESS) {
      // Optional: dev-only warning
      if (process.env.NODE_ENV === 'development') {
        console.warn('[CARD LONGPRESS] BASE_USDT_ADDRESS is not set')
      }
      return
    }

    // Prevent native long-press context menu
    if (e) {
      e.preventDefault?.()
    }

    // Cancel any existing timeout for safety
    if (longPressTimeoutRef.current !== null) {
      window.clearTimeout(longPressTimeoutRef.current)
      longPressTimeoutRef.current = null
    }

    // Mark start time
    pressStartRef.current = Date.now()
    longPressActiveRef.current = true
  }

  const handlePressEnd = async () => {
    if (!isTop || !BASE_USDT_ADDRESS) {
      cancelLongPress()
      return
    }

    const startedAt = pressStartRef.current
    pressStartRef.current = null

    if (!startedAt) {
      cancelLongPress()
      return
    }

    const duration = Date.now() - startedAt

    // Threshold: 550ms
    if (duration < 550) {
      cancelLongPress()
      return
    }

    // Only one attempt per press
    if (hasLongPressAttemptRef.current) {
      cancelLongPress()
      return
    }

    hasLongPressAttemptRef.current = true
    console.log('[CARD LONGPRESS] Attempting clipboard copy from gesture end')

    try {
      await navigator.clipboard.writeText(BASE_USDT_ADDRESS)
      pushNotification({
        kind: 'payment_sent',
        title: 'USDT address copied',
        body: 'Base USDT address copied to clipboard',
      })
    } catch (err) {
      console.error('[CARD LONGPRESS] Failed to copy USDT address', err)
      pushNotification({
        kind: 'payment_failed',
        title: 'Failed to copy USDT address',
        body: 'Unable to copy address, please try again',
      })
    } finally {
      cancelLongPress()
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelLongPress()
    }
  }, [])

  // Debug: verify flag size after mount (for both ZAR and MZN)
  useEffect(() => {
    const currency = getCardCurrency(card.type)
    if (currency) {
      const flagInfo = FLAG_BY_CCY[currency]
      if (flagInfo) {
        const el = document.getElementById(`${flagInfo.id}-${card.type}`)
        if (el) {
          const r = el.getBoundingClientRect()
          // eslint-disable-next-line no-console
          console.log(`[FLAG ${currency} SIZE]`, Math.round(r.width), 'x', Math.round(r.height))
        }
      }
    }
  }, [card.type])

  // Get allocation cents for this card
  // For authed users: read directly from Firestore wallets to avoid demo values
  // Get auth state and balance mode
  const authState = useAuthStore((state) => state.getAuthState())
  const balanceMode = useAuthStore((state) => state.getBalanceMode())
  const isAuthed = useAuthStore((state) => state.isAuthed)
  const { wallets, demoMode, walletsHydrated } = useWalletStore()
  const isBalanceReady = useAppModeStore((state) => state.isBalanceReady())
  
  const allocKey = CARD_TO_ALLOC_KEY[card.type]
  
  // Map alloc key to wallet ID
  const walletIdMap: Record<string, string> = {
    cashCents: 'cashZAR',
    ethCents: 'eth',
    zwdCents: 'cashZWD',
    mznCents: 'cashMZN',
    btcCents: 'btc',
    earningsCents: 'earnings',
  }
  const walletId = walletIdMap[allocKey]
  
  // BALANCE RENDERING GATE: Single readiness gate
  // Cards must show 0/skeleton until isBalanceReady === true
  // This prevents any demo/animated balances from showing post-auth
  let cents: number
  let showPlaceholder = false
  
  if (authState === 'loading') {
    // Loading: show placeholder/skeleton, do not start demo balance animations
    showPlaceholder = true
    cents = 0
  } else if (authState === 'authed') {
    // Authed: Only show real balances if isBalanceReady (authState === 'authed' && walletsHydrated === true)
    // Force 0 until ready to prevent any demo/animated balance leaks
    // CRITICAL: Even if wallets exists, ignore it until walletsHydrated is true
    // This prevents stale wallet data from previous session from showing
    if (isBalanceReady && wallets && !demoMode && walletId) {
      // Read directly from Firestore wallets (source of truth)
      // Option A: fiatBalance only (lockedBalance shown separately if needed)
      const wallet = (wallets as any)[walletId]
      const fiatBalance = wallet?.fiatBalance ?? 0
      cents = Math.round(fiatBalance * 100)
    } else {
      // Not ready yet: show 0 (freeze until Firestore arrives)
      // CRITICAL: Ignore any wallet data until walletsHydrated is true
      // This prevents stale data from previous session or demo values from showing
      cents = 0
      if (process.env.NODE_ENV !== 'production' && !isBalanceReady) {
        console.log('[BALANCE_READY] Card balance forced to 0 (waiting for hydration)', {
          cardType: card.type,
          walletId,
          isBalanceReady,
          walletsHydrated,
          hasWallets: !!wallets,
          walletValue: wallets && walletId ? (wallets as any)[walletId]?.fiatBalance : null,
        })
      }
    }
  } else {
    // Unauthed: no preview balances — user has not committed funds yet
    cents = 0
  }
  
  const zar = cents / 100
  const isMeticalAmount = card.type === 'mzn' || card.type === 'yieldSurprise'
  const liveMzn =
    typeof fxRates?.rates?.MZN === 'number' && fxRates.rates.MZN > 0
      ? fxRates.rates.MZN
      : 0
  const quotedMznPerZar = quotedMznPerZarForDestination(
    liveMzn,
    card.type === 'savings' ? 'MZN' : 'ZAR'
  )
  const convertedAmount = isMeticalAmount
    ? mznToZar(zar, quotedMznPerZar)
    : card.type === 'savings'
      ? zarToMzn(zar, quotedMznPerZar)
      : zar / FX_USD_ZAR_DEFAULT
  const pct = allocPct(cents)
  
  // Generate a stable key for SlotCounter that changes when balance changes
  // This forces remount when balance updates (e.g., after payment or withdrawal)
  // Include updatedAt timestamp to catch Firestore updates even if balance value is same
  // Use rounded cents + updatedAt to avoid floating point precision issues and catch all updates
  const wallet = authState === 'authed' && isBalanceReady && walletId ? (wallets as any)[walletId] : null
  const updatedAtMillis = wallet?.updatedAt?.toMillis?.() ?? wallet?.updatedAt ?? 0
  const balanceKey = authState === 'authed' && isBalanceReady && walletId
    ? `${walletId}-${cents}-${updatedAtMillis}`
    : `${walletId}-not-ready`

  // Check if ANY card exceeds threshold - if so, apply compact sizing to ALL cards for consistency
  // Use same source as balance display (respect isBalanceReady gate)
  let cashZAR: number
  let ethZAR: number
  let zwdZAR: number
  
  if (authState === 'authed') {
    // Authed: only use real values if isBalanceReady
    if (isBalanceReady && wallets && !demoMode) {
      // Ready: use Firestore values (fiatBalance only, no lockedBalance)
      cashZAR = ((wallets as any)?.cashZAR?.fiatBalance ?? 0)
      ethZAR = ((wallets as any)?.eth?.fiatBalance ?? 0)
      zwdZAR = ((wallets as any)?.cashZWD?.fiatBalance ?? 0)
    } else {
      // Not ready yet: show 0 (don't use alloc which might have demo values)
      cashZAR = 0
      ethZAR = 0
      zwdZAR = 0
    }
  } else {
    // Pre-auth: use alloc (demo values for marketing)
    cashZAR = alloc.cashCents / 100
    ethZAR = alloc.ethCents / 100
    zwdZAR = alloc.zwdCents / 100
  }
  
  const shouldUseCompactSizing = cashZAR > 99999.99 || ethZAR > 99999.99 || zwdZAR > 99999.99

  // Get portfolio data for this card
  // Use direct selector for reactivity (Zustand will re-render when holdings[symbol] changes)
  const symbol = CARD_TO_SYMBOL[card.type]
  const holding = usePortfolioStore((s) => s.holdings[symbol])
  const mznCapacityPercent = usePortfolioStore(
    (s) => s.holdings.MZN?.health ?? HEALTH_CONFIG.mzn.percent
  )
  const portfolioAllocationPct = holding?.allocationPct ?? pct
  const portfolioDisplayPct = holding?.displayPct ?? Math.round(pct)
  const portfolioHealth = holding?.health ?? HEALTH_CONFIG[card.type].percent
  const operationalBarPercent =
    card.type === 'mzn'
      ? mznCapacityPercent
      : card.type === 'savings'
        ? 100 - mznCapacityPercent
        : portfolioHealth
  
  // Cash-card bars represent capacity/volume, so keep their progress fill green.
  const healthLevel =
    card.type === 'mzn' || card.type === 'savings'
      ? 'good'
      : getHealthLevel(operationalBarPercent)

  // Animate allocation % with fade in/out (use displayPct for pill, allocationPct for internal calculations)
  const animatedAllocationPct = useTweenNumber(portfolioDisplayPct, {
    duration: 240,
    delay: 0,
    easing: 'easeOutCubic',
    round: (n) => Math.round(n),
  })

  // Check for reduced motion preference (client-side only)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
      setPrefersReducedMotion(mediaQuery.matches)
      const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches)
      mediaQuery.addEventListener('change', handler)
      return () => mediaQuery.removeEventListener('change', handler)
    }
  }, [])

  // Health animation with two-stage tween for minimum visual delta
  // Cash: gentler movement (0.6/2.0), ETH/PEPE: standard (1.2/3.5)
  // Skip two-stage for reduced motion (just use direct value)
  const isCash = card.type === 'savings' || card.type === 'mzn'
  const healthTweenResult = useTwoStageTween(operationalBarPercent, {
    minVisualDelta: isCash ? 0.6 : 1.2,
    previewCap: isCash ? 2.0 : 3.5,
    stageADuration: 220,
    stageBDuration: 120,
    stageBDelay: 40,
    round: (n) => Math.round(n * 10) / 10,
  })
  const animatedHealth = prefersReducedMotion ? operationalBarPercent : healthTweenResult.value
  const isHealthAnimating = prefersReducedMotion ? false : healthTweenResult.isAnimating

  // Visibility states for health bar
  const prevHealthRef = useRef(operationalBarPercent)
  const healthPulseTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [isHealthBarChanging, setIsHealthBarChanging] = useState(false)

  // Detect health changes and trigger pulse (no numeric display)
  useEffect(() => {
    if (operationalBarPercent !== prevHealthRef.current) {
      // Only add pulse if not reduced motion
      if (!prefersReducedMotion) {
        setIsHealthBarChanging(true)

        // Clear existing timeout
        if (healthPulseTimeoutRef.current) {
          clearTimeout(healthPulseTimeoutRef.current)
        }

        // Remove pulse class after 200ms
        healthPulseTimeoutRef.current = setTimeout(() => {
          setIsHealthBarChanging(false)
        }, 200)
      }

      prevHealthRef.current = operationalBarPercent
    }

    return () => {
      if (healthPulseTimeoutRef.current) {
        clearTimeout(healthPulseTimeoutRef.current)
      }
    }
  }, [operationalBarPercent, prefersReducedMotion])

  // Map card type to target currency for exchange rate
  const CARD_TO_EXCHANGE_CURRENCY: Record<CardType, string | null> = {
    savings: null, // Base currency (ZAR), no exchange rate needed
    zwd: 'USD', // Show USD = 1 ZAR
    mzn: 'MZN', // Show MZN = 1 ZAR
    yield: null, // Crypto card, keep APY
    btc: null, // Crypto card, keep APY
    yieldSurprise: null, // Countdown timer, skip exchange rate
  }

  // Get card definition for annual yield (fallback)
  // Map yieldSurprise to yield for card definition (yieldSurprise reuses yield card config)
  const cardDef = getCardDefinition(card.type === 'yieldSurprise' ? 'yield' : card.type)
  const annualYield = (cardDef.annualYieldBps ?? 938) / 100 // default 9.38% if undefined
  const formattedAnnualYield = annualYield.toFixed(2) // "9.38"

  // Rewards card countdown: 24h cycle that resets at 17:00 local time
  // MUST be declared BEFORE getPillContent() to avoid TDZ error
  const [countdown, setCountdown] = useState(getSecondsUntil17hReset)

  useEffect(() => {
    if (card.type !== 'yieldSurprise') return

    setCountdown(getSecondsUntil17hReset())
    const id = setInterval(() => {
      setCountdown(getSecondsUntil17hReset())
    }, 1000)

    return () => clearInterval(id)
  }, [card.type])

  const formattedCountdown = useMemo(() => {
    if (card.type !== 'yieldSurprise') return null
    const hours = Math.floor(countdown / 3600)
    const minutes = Math.floor((countdown % 3600) / 60)
    return `${hours}h${minutes.toString().padStart(2, '0')}`
  }, [countdown, card.type])

  // Determine what to display in the pill
  const getPillContent = (): { strong: string; label: string } => {
    if (card.type === 'yieldSurprise' && formattedCountdown) {
      return {
        strong: formattedCountdown,
        label: 'left',
      }
    }

    if (card.type === 'mzn') {
      return {
        strong: 'SELL',
        label: `${quotedMznPerZar.toFixed(2)}Mt/R`,
      }
    }

    if (card.type === 'savings') {
      return {
        strong: 'BUY',
        label: `${quotedMznPerZar.toFixed(2)}Mt/R`,
      }
    }

    if (card.type === 'zwd') {
      return {
        strong: '72 MZN',
        label: '= 1 USD',
      }
    }

    // Check if this card should show exchange rate
    const targetCurrency = CARD_TO_EXCHANGE_CURRENCY[card.type]
    const rate = targetCurrency ? fxRates?.rates?.[targetCurrency] : null
    
    // Only show rate if it's a valid number (not null/undefined)
    if (targetCurrency && rate !== null && rate !== undefined && typeof rate === 'number' && !isNaN(rate)) {
      // Show exchange rate: "3.88 MZN = 1 ZAR"
      const feeBps = 0 // Platform fee (0% for now, can be configured later)
      const adjustedRate = applyFeeToRate(rate, feeBps)
      const formattedRate = adjustedRate.toFixed(2) // "3.88"
      return {
        strong: `${formattedRate} ${targetCurrency}`,
        label: '= 1 ZAR',
      }
    }

    // Fallback: Show APY (for crypto cards or if exchange rate fails/missing)
    return {
      strong: `${formattedAnnualYield}%`,
      label: 'APY',
    }
  }

  const pillContent = getPillContent()

  // Double-tap detection for APY/timer pill clicks
  const DOUBLE_TAP_DELAY = 300 // ms
  const lastPillTapRef = useRef<number>(0)

  // Handler for APY/timer pill double-tap
  const handlePillDoubleTap = (e: React.MouseEvent | React.TouchEvent) => {
    // Prevent card's onClick (which opens signup) from firing on pill taps
    e.stopPropagation()
    e.preventDefault()

    if (!onApyPillClick) return

    const now = Date.now()
    const timeSinceLastTap = now - lastPillTapRef.current

    if (timeSinceLastTap < DOUBLE_TAP_DELAY) {
      // Second tap within delay window → open helper sheet
      onApyPillClick(card.type)
      lastPillTapRef.current = 0 // Reset to prevent triple-tap
    } else {
      // First tap or tap after delay → just record timestamp
      lastPillTapRef.current = now
    }
  }

  // Conditionally add clickable class when handler is provided
  const pillClassName = clsx(
    'card-allocation-pill',
    onApyPillClick && 'card-allocation-pill--clickable'
  )

  // Compose className with special mode classes
  const finalClassName = clsx(
    className,
    'card-noselect', // Prevent native long-press context menu
    isSpecialMode && !isSpecialCard && 'dimmed-for-special',
    isSpecialMode && isSpecialCard && 'credit-surprise'
  )

  return (
    <div
      key={index}
      className={finalClassName}
      onClick={onClick}
      onTouchStart={(e) => {
        onTouchStart?.(e)
        handlePressStart(e)
      }}
      onTouchEnd={(e) => {
        onTouchEnd?.(e)
        handlePressEnd()
      }}
      onTouchCancel={(e) => {
        cancelLongPress()
      }}
      onMouseDown={(e) => {
        if (e.button === 0) {
          // Only for left-click
          handlePressStart(e)
        }
      }}
      onContextMenu={(e) => {
        // Prevent native context menu on long-press
        e.preventDefault()
      }}
      onMouseUp={(e) => {
        if (e.button === 0) {
          handlePressEnd()
        }
      }}
      onMouseLeave={(e) => {
        cancelLongPress()
      }}
      style={style}
    >
      {/* Unified card image rendering: all cards use .card-canvas with aspect-ratio: 86/54 */}
      <div className={card.type === 'yield' || card.type === 'yieldSurprise' ? 'card-canvas card-yield-rounded' : 'card-canvas'}>
        <Image
          src={card.image}
          alt={card.type === 'yield' ? 'GoB yield card' : card.type === 'yieldSurprise' ? 'GoB yield surprise card' : card.alt}
          fill
          sizes="(max-width: 768px) 88vw, 420px"
          priority={isTop}
          style={{ objectFit: 'cover', borderRadius: 'inherit' }}
          quality={92}
        />
      </div>

      {/* Currency/Coin badge at top-left - flags for ZAR/MZN, coins for ETH/PEPE */}
      {(() => {
        // Check for currency (flags) first
        const currency = getCardCurrency(card.type)
        if (currency) {
          const flagInfo = FLAG_BY_CCY[currency]
          if (flagInfo) {
            return (
              <div className="card-currency-chip" aria-hidden>
                <span className="flag-wrap">
                  <img
                    id={`${flagInfo.id}-${card.type}`}
                    src={flagInfo.src}
                    alt={currency === 'ZAR' ? 'South Africa flag' : currency === 'MZN' ? 'Mozambique flag' : currency === 'USD' ? 'United States flag' : 'Flag'}
                    className="flag-icon"
                    draggable={false}
                    decoding="async"
                    loading="eager"
                  />
                </span>
              </div>
            )
          }
        }
        
        // Check for coin badge (ETH/BTC)
        const coinInfo = COIN_BY_CARD[card.type]
        if (coinInfo) {
          return (
            <div className="card-currency-chip" aria-hidden>
              <span className="flag-wrap">
                <img
                  id={coinInfo.id}
                  src={coinInfo.src}
                  alt={card.type === 'yield' ? 'ETH coin' : card.type === 'btc' ? 'BTC coin' : 'Crypto coin'}
                  className="flag-icon"
                  draggable={false}
                  decoding="async"
                  loading="eager"
                />
                <span className="currency-code">{coinInfo.label}</span>
              </span>
            </div>
          )
        }
        
        return null
      })()}

      {/* Amount display with SlotCounter (shifted down) - only show for top card */}
      {depth === 0 && (
        <div className={`card-amounts card-amounts--${card.type} card-amounts--shifted`} suppressHydrationWarning>
          {showPlaceholder ? (
            // Placeholder/skeleton while auth state is loading
            <>
              <div className="card-amounts__zar amount-headline" style={{ opacity: 0.5 }} suppressHydrationWarning>
                <span className="amt-int card-amounts__whole">{isMeticalAmount ? 'Mt 0' : 'R 0'}</span>
                <span className="amt-dot card-amounts__dot">.</span>
                <span className="amt-cents card-amounts__cents">00</span>
              </div>
              <div className="card-amounts__usdt" style={{ opacity: 0.5 }} suppressHydrationWarning>
                <span>0.00 {isMeticalAmount ? 'ZAR' : 'MZN'}</span>
              </div>
            </>
          ) : (
            <>
              <div
                className={clsx('card-amounts__zar amount-headline amount-topline', {
                  'flash-up': flashDirection === 'up',
                  'flash-down': flashDirection === 'down',
                  'amount-topline--compact': shouldUseCompactSizing,
                })}
                aria-label={`${zar.toFixed(2)} ${isMeticalAmount ? 'meticais' : 'rand'}`}
                onAnimationEnd={onFlashEnd}
                suppressHydrationWarning
              >
                <SlotCounter
                  key={balanceKey}
                  value={zar}
                  format={formatZAR}
                  durationMs={isBalanceReady ? 700 : 0}
                  className="card-amounts__zar-value"
                  onStart={() => {
                    // Flash direction is already computed and set
                  }}
                  renderMajor={(major) => (
                    <span className="amt-int card-amounts__whole" suppressHydrationWarning>
                      {isMeticalAmount ? `Mt ${major}` : card.type === 'savings' ? `R ${major}` : major}
                    </span>
                  )}
                  renderCents={(cents) => (
                    <>
                      <span className="amt-dot card-amounts__dot" suppressHydrationWarning>.</span>
                      <span className="amt-cents card-amounts__cents" suppressHydrationWarning>{cents}</span>
                    </>
                  )}
                />
              </div>
              <div
                className="card-amounts__usdt"
                aria-label={`${convertedAmount.toFixed(2)} ${isMeticalAmount ? 'ZAR' : 'MZN'}`}
                suppressHydrationWarning
              >
                <SlotCounter 
                  key={`${balanceKey}-converted`}
                  value={convertedAmount}
                  format={formatConvertedAmount}
                  durationMs={isBalanceReady ? 700 : 0} 
                  className="card-amounts__usdt-value" 
                />
                <span style={{ marginLeft: '4px' }}>{isMeticalAmount ? 'ZAR' : 'MZN'}</span>
              </div>
            </>
          )}
        </div>
      )}

      {card.type === 'yieldSurprise' && (
        <div className="card-label card-label--faded card-label--cropped">REWARDS</div>
      )}

      {/* Bottom-left annual yield pill or countdown timer */}
      <div
        className={pillClassName}
        onClick={handlePillDoubleTap}
        style={{ cursor: onApyPillClick ? 'pointer' : 'default' }}
      >
        <span className="card-allocation-pill__text">
          <span className="card-allocation-pill__yield-strong">
            {pillContent.strong}
          </span>{' '}
          <span className="card-allocation-pill__yield-label">
            {pillContent.label}
          </span>
        </span>
      </div>

      {/* Bottom-right health bar */}
      {card.type !== 'savings' && (
        <div className="card-health-group">
          <div className="card-health-bar-container">
            <div
              className={clsx(
                'card-health-bar-fill',
                `card-health-bar-fill--${healthLevel}`,
                {
                  'card-health-bar-fill--changing': isHealthBarChanging,
                  'card-health-bar-fill--minimum': operationalBarPercent <= 0,
                }
              )}
              style={{ width: `${Math.max(5, Math.min(100, animatedHealth))}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}


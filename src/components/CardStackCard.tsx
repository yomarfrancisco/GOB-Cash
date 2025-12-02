'use client'

import Image from 'next/image'
import type { StaticImageData } from 'next/image'
import { useRef, useEffect, useState } from 'react'
import SlotCounter from './SlotCounter'
import { formatZAR, formatUSDT } from '@/lib/formatCurrency'
import { useWalletAlloc } from '@/state/walletAlloc'
import { usePortfolioStore } from '@/store/portfolio'
import { useTweenNumber } from '@/lib/animations/useTweenNumber'
import { useTwoStageTween } from '@/lib/animations/useTwoStageTween'
import clsx from 'clsx'
import { getCardDefinition } from '@/lib/cards/cardDefinitions'
import { BASE_USDT_ADDRESS } from '@/config/addresses'
import { useNotificationStore } from '@/store/notifications'

const FX_USD_ZAR_DEFAULT = 18.1

type CardType = 'zwd' | 'savings' | 'yield' | 'mzn' | 'btc' | 'yieldSurprise'

type HealthLevel = 'good' | 'moderate' | 'fragile'

const HEALTH_CONFIG: Record<CardType, { level: HealthLevel; percent: number }> = {
  savings: { level: 'good', percent: 100 },
  zwd: { level: 'good', percent: 100 },
  yield: { level: 'moderate', percent: 60 },
  mzn: { level: 'good', percent: 100 },
  btc: { level: 'moderate', percent: 15 },
  yieldSurprise: { level: 'moderate', percent: 60 }, // Reuse yield card health config
}

const CARD_LABELS: Record<CardType, string> = {
  savings: 'CASH CARD', // ZAR fiat card
  mzn: 'CASH CARD', // MZN fiat card
  zwd: 'CASH CARD', // ZWD fiat card
  yield: 'CASH CARD', // ETH crypto card
  btc: 'CASH CARD', // BTC crypto card
  yieldSurprise: 'CREDIT CARD', // Credit surprise card
}

const CARD_TO_ALLOC_KEY: Record<CardType, 'cashCents' | 'ethCents' | 'zwdCents' | 'mznCents' | 'btcCents'> = {
  savings: 'cashCents',
  zwd: 'zwdCents',
  yield: 'ethCents',
  mzn: 'mznCents',
  btc: 'btcCents',
  yieldSurprise: 'ethCents', // Reuse yield card allocation (ethCents)
}

const CARD_TO_SYMBOL: Record<CardType, 'CASH' | 'ETH' | 'ZWD' | 'MZN' | 'BTC'> = {
  savings: 'CASH',
  zwd: 'ZWD',
  yield: 'ETH',
  mzn: 'MZN',
  btc: 'BTC',
  yieldSurprise: 'ETH', // Reuse yield card symbol (ETH)
}

// Flag mapping by currency
const FLAG_BY_CCY: Record<string, { src: string; id: string }> = {
  ZAR: { src: '/assets/south%20africa.svg', id: 'flag-za' },
  MZN: { src: '/assets/mozambique.svg', id: 'flag-mz' },
  ZWD: { src: '/assets/zimbabwe.png', id: 'flag-zw' },
}

// Coin mapping for crypto cards
const COIN_BY_CARD: Record<CardType, { src: string; id: string; label: string } | null> = {
  savings: null, // Uses flag
  zwd: null, // Uses flag (ZWD)
  yield: { src: '/assets/eth_coin.png', id: 'coin-eth', label: 'ETH' },
  mzn: null, // Uses flag
  btc: { src: '/assets/Bitcoin-Logo.png', id: 'coin-btc', label: 'BTC' },
  yieldSurprise: null, // Uses flag (ZAR) instead of coin
}

// Currency label mapping
const CURRENCY_LABEL: Record<string, string> = {
  ZAR: 'ZAR',
  MZN: 'MZN',
  ZWD: 'ZWD',
}

// Determine currency for card type (for flags)
const getCardCurrency = (cardType: CardType): string | null => {
  if (cardType === 'savings') return 'ZAR'
  if (cardType === 'mzn') return 'MZN'
  if (cardType === 'zwd') return 'ZWD'
  if (cardType === 'yieldSurprise') return 'ZAR' // CREDIT CARD uses ZAR flag
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
        const el = document.getElementById(flagInfo.id)
        if (el) {
          const r = el.getBoundingClientRect()
          // eslint-disable-next-line no-console
          console.log(`[FLAG ${currency} SIZE]`, Math.round(r.width), 'x', Math.round(r.height))
        }
      }
    }
  }, [card.type])

  // Get allocation cents for this card
  const allocKey = CARD_TO_ALLOC_KEY[card.type]
  const cents = (alloc as any)[allocKey] || 0
  const zar = cents / 100
  const usdt = zar / FX_USD_ZAR_DEFAULT
  const pct = allocPct(cents)

  // Check if ANY card exceeds threshold - if so, apply compact sizing to ALL cards for consistency
  const cashZAR = alloc.cashCents / 100
  const ethZAR = alloc.ethCents / 100
  const zwdZAR = alloc.zwdCents / 100
  const shouldUseCompactSizing = cashZAR > 99999.99 || ethZAR > 99999.99 || zwdZAR > 99999.99

  // Get portfolio data for this card
  // Use direct selector for reactivity (Zustand will re-render when holdings[symbol] changes)
  const symbol = CARD_TO_SYMBOL[card.type]
  const holding = usePortfolioStore((s) => s.holdings[symbol])
  const portfolioAllocationPct = holding?.allocationPct ?? pct
  const portfolioDisplayPct = holding?.displayPct ?? Math.round(pct)
  const portfolioHealth = holding?.health ?? HEALTH_CONFIG[card.type].percent

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
  const isCash = card.type === 'savings'
  const healthTweenResult = useTwoStageTween(portfolioHealth, {
    minVisualDelta: isCash ? 0.6 : 1.2,
    previewCap: isCash ? 2.0 : 3.5,
    stageADuration: 220,
    stageBDuration: 120,
    stageBDelay: 40,
    round: (n) => Math.round(n * 10) / 10,
  })
  const animatedHealth = prefersReducedMotion ? portfolioHealth : healthTweenResult.value
  const isHealthAnimating = prefersReducedMotion ? false : healthTweenResult.isAnimating

  // Visibility states for health bar
  const prevHealthRef = useRef(portfolioHealth)
  const healthPulseTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [isHealthBarChanging, setIsHealthBarChanging] = useState(false)

  // Detect health changes and trigger pulse (no numeric display)
  useEffect(() => {
    if (portfolioHealth !== prevHealthRef.current) {
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

      prevHealthRef.current = portfolioHealth
    }

    return () => {
      if (healthPulseTimeoutRef.current) {
        clearTimeout(healthPulseTimeoutRef.current)
      }
    }
  }, [portfolioHealth, prefersReducedMotion])

  // Get card definition for annual yield
  // Map yieldSurprise to yield for card definition (yieldSurprise reuses yield card config)
  const cardDef = getCardDefinition(card.type === 'yieldSurprise' ? 'yield' : card.type)
  const annualYield = (cardDef.annualYieldBps ?? 938) / 100 // default 9.38% if undefined
  const formattedAnnualYield = annualYield.toFixed(2) // "9.38"

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
      {card.type === 'yield' || card.type === 'yieldSurprise' ? (
        <div className="card-canvas card-yield-rounded">
          <Image
            src={card.image}
            alt={card.type === 'yield' ? 'GoB yield card' : 'GoB yield surprise card'}
            fill
            sizes="(max-width: 768px) 88vw, 420px"
            priority
            style={{ objectFit: 'cover', borderRadius: 'inherit' }}
          />
        </div>
      ) : (
        <Image 
          src={card.image} 
          alt={card.alt} 
          width={card.width} 
          height={card.height} 
          className="card-bg"
          aria-hidden="true"
          unoptimized 
        />
      )}

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
                    id={flagInfo.id}
                    src={flagInfo.src}
                    alt={currency === 'ZAR' ? 'South Africa flag' : 'Mozambique flag'}
                    className="flag-icon"
                    draggable={false}
                    decoding="async"
                    loading="eager"
                  />
                  <span className="currency-code">{CURRENCY_LABEL[currency]}</span>
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
          <div
            className={clsx('card-amounts__zar amount-headline amount-topline', {
              'flash-up': flashDirection === 'up',
              'flash-down': flashDirection === 'down',
              'amount-topline--compact': shouldUseCompactSizing,
            })}
            aria-label={`${zar.toFixed(2)} rand`}
            onAnimationEnd={onFlashEnd}
            suppressHydrationWarning
          >
            <SlotCounter
              value={zar}
              format={formatZAR}
              durationMs={700}
              className="card-amounts__zar-value"
              onStart={() => {
                // Flash direction is already computed and set
              }}
              renderMajor={(major) => <span className="amt-int card-amounts__whole" suppressHydrationWarning>{major}</span>}
              renderCents={(cents) => (
                <>
                  <span className="amt-dot card-amounts__dot" suppressHydrationWarning>.</span>
                  <span className="amt-cents card-amounts__cents" suppressHydrationWarning>{cents}</span>
                </>
              )}
            />
          </div>
          <div className="card-amounts__usdt" aria-label={`${usdt.toFixed(2)} USDT`} suppressHydrationWarning>
            <SlotCounter value={usdt} format={formatUSDT} durationMs={700} className="card-amounts__usdt-value" />
            <span style={{ marginLeft: '4px' }}>USDT</span>
          </div>
        </div>
      )}

      {/* Top-right card label */}
      <div className="card-label">{CARD_LABELS[card.type]}</div>

      {/* Bottom-left annual yield pill */}
      <div className="card-allocation-pill">
        <span className="card-allocation-pill__text">
          <span className="card-allocation-pill__yield-strong">
            {formattedAnnualYield}%
          </span>{' '}
          <span className="card-allocation-pill__yield-label">
            APY
          </span>
        </span>
      </div>

      {/* Bottom-right health bar */}
      <div className="card-health-group">
        <span className="card-health-label">{card.type === 'yieldSurprise' ? 'Social score' : 'Market Health'}</span>
        <div className="card-health-bar-container">
          <div
            className={clsx(
              `card-health-bar-fill card-health-bar-fill--${HEALTH_CONFIG[card.type].level}`,
              {
                'card-health-bar-fill--changing': isHealthBarChanging,
              }
            )}
            style={{ width: `${Math.max(0, Math.min(100, animatedHealth))}%` }}
          />
        </div>
      </div>
    </div>
  )
}


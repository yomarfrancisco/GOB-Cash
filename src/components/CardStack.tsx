'use client'

import Image from 'next/image'
import { useState, useRef, useEffect, forwardRef, useImperativeHandle, useCallback, useMemo } from 'react'
import type React from 'react'
import type { StaticImageData } from 'next/image'
import { CARD_FLIP_CLASSES } from '@/lib/animations/cardFlipClassNames'
import { DEV_CARD_FLIP_DEBUG } from '@/lib/flags'
import { FLIP_MS } from '@/lib/animations/useAiActionCycle'
import { useWalletAlloc } from '@/state/walletAlloc'
import { getStackStyle } from '@/lib/stack/getStackStyle'
import CardStackCard from './CardStackCard'
import { useAuthStore } from '@/store/auth'
import { useIsAdminUser } from '@/lib/restrictions'
import type { FxRates } from '@/lib/exchangeRates/useFxRates'
import { useTransitDayClock } from '@/lib/fx/useTransitDayClock'
import { zarLiquidityJourneyBarPercent } from '@/lib/fx/transitDayClock'
import { inventoryDominantCard } from '@/lib/fx/inventoryDominant'
import { sellMznPerZar } from '@/lib/mznZar'
import { useWalletStore } from '@/store/wallets'
import { useAppModeStore } from '@/store/appMode'
import type { ConversionStory } from '@/lib/animations/conversionStory'
import {
  inferredStoriesSuppressed,
  requestConversionStory,
  setConversionStoryPlayer,
} from '@/lib/animations/conversionStoryBus'
import { conversionStoryFromWalletTransition } from '@/lib/animations/settlementPlayback'
import { useActivityStore } from '@/store/activity'

// Temporary FX rate (will be wired to real API later)
const FX_USD_ZAR_DEFAULT = 18.1

// Health levels: 'good' | 'moderate' | 'fragile'
type HealthLevel = 'good' | 'moderate' | 'caution' | 'fragile'

// Health configuration per card type
const HEALTH_CONFIG: Record<CardType, { level: HealthLevel; percent: number }> = {
  savings: { level: 'good', percent: 100 },
  zwd: { level: 'good', percent: 100 },
  yield: { level: 'moderate', percent: 60 },
  mzn: { level: 'good', percent: 100 },
  btc: { level: 'moderate', percent: 15 },
  yieldSurprise: { level: 'moderate', percent: 60 }, // Reuse yield card health config
}

export type CardType = 'zwd' | 'savings' | 'yield' | 'mzn' | 'btc' | 'yieldSurprise'

interface CardData {
  type: CardType
  image: string | StaticImageData
  alt: string
  width: number
  height: number
}

const allCardsData: CardData[] = [
  {
    type: 'savings',
    image: '/assets/cards/card-ZAR_231026.jpg',
    alt: 'Cash Card',
    width: 342,
    height: 213,
  },
  {
    type: 'mzn',
    image: '/assets/cards/card-MZN_231026.jpg',
    alt: 'MZN Cash Card',
    width: 342,
    height: 213,
  },
  {
    type: 'zwd',
    image: '/assets/cards/card-USA.jpg',
    alt: 'USD Card',
    width: 342,
    height: 213,
  },
  {
    type: 'yield',
    image: '/assets/cards/card-ETH2X-1.jpg',
    alt: 'Yield Card',
    width: 310,
    height: 193,
  },
  {
    type: 'btc',
    image: '/assets/cards/card-BTC2X-1.jpg',
    alt: 'BTC Card',
    width: 342,
    height: 213,
  },
  {
    type: 'yieldSurprise',
    image: '/assets/cards/card_PAGA_SA2.jpg',
    alt: 'Transit Card',
    width: 342,
    height: 213,
  },
]

// Home: MZN + ZAR only. ROUTE (yieldSurprise) is collapsed into the ZAR card.
const ALWAYS_HIDDEN_CARD_TYPES: CardType[] = ['yield', 'btc', 'zwd', 'yieldSurprise']

function homeCardsForAdmin(_isAdmin: boolean): CardData[] {
  const visible = allCardsData.filter((card) => !ALWAYS_HIDDEN_CARD_TYPES.includes(card.type))
  // ZAR ↔ MZN (ROUTE balance is included on the ZAR card).
  return [...visible].sort((a, b) => {
    const rank = (type: CardType) => (type === 'savings' ? 0 : type === 'mzn' ? 1 : 2)
    return rank(a.type) - rank(b.type)
  })
}

// Card labels mapping
const CARD_LABELS: Record<CardType, string> = {
  savings: 'CASH CARD', // ZAR fiat card
  mzn: 'CASH CARD', // MZN fiat card
  zwd: 'CASH CARD', // ZWD fiat card
  yield: 'INVESTMENT CARD', // ETH crypto card
  btc: 'INVESTMENT CARD', // BTC crypto card
  yieldSurprise: 'TRANSIT', // Conversion in transit until 09:00 clear
}

// Map card type to allocation key
const CARD_TO_ALLOC_KEY: Record<CardType, 'cashCents' | 'ethCents' | 'zwdCents' | 'earningsCents' | 'mznCents' | 'btcCents'> = {
  savings: 'cashCents',
  zwd: 'zwdCents',
  yield: 'ethCents',
  mzn: 'mznCents',
  btc: 'btcCents',
  yieldSurprise: 'earningsCents', // Earnings card has its own balance (never starts at 0)
}

// Map card type to portfolio symbol
const CARD_TO_SYMBOL: Record<CardType, 'CASH' | 'ETH' | 'ZWD' | 'MZN' | 'BTC'> = {
  savings: 'CASH',
  zwd: 'ZWD',
  yield: 'ETH',
  mzn: 'MZN',
  btc: 'BTC',
  yieldSurprise: 'CASH',
}

interface CardStackProps {
  onTopCardChange?: (cardType: CardType) => void
  flipControllerRef?: React.MutableRefObject<{ pause: () => void; resume: () => void } | null>
  aiCycleControllerRef?: React.MutableRefObject<{ pause: () => void; resume: () => void } | null>
  onCardClick?: () => void // Optional auth guard wrapper for card clicks
  onCreditSurprise?: (amountZAR: number) => void // Callback for credit surprise animation
  onApyPillClick?: (cardType: CardType, amount: number) => void
  fxRates?: FxRates | null // Exchange rates from server
}

export type CardStackHandle = {
  cycleNext: () => void
  flipToCard: (cardType: CardType, direction?: 'forward' | 'back') => Promise<void>
  revealCreditSurprise: () => void
  /** @deprecated Prefer playConversionStory — kept for callers still on capital-shock reveal. */
  playCapitalShockReveal: (params: { creditZar: number }) => Promise<void>
  /** Reserve / ROUTE / split / 09:00 clear — one consistent card story. */
  playConversionStory: (story: ConversionStory) => Promise<void>
}

const FLIP_DURATION_MS = FLIP_MS
/** Match CardStackCard SlotCounter duration so source ↓ is readable before shuffle. */
const SHOCK_SOURCE_FLASH_MS = 750
const SHOCK_DEST_FLASH_MS = 750

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

const CardStack = forwardRef<CardStackHandle, CardStackProps>(function CardStack({ onTopCardChange, flipControllerRef: externalFlipControllerRef, aiCycleControllerRef, onCardClick, onCreditSurprise, onApyPillClick, fxRates }, ref) {
  const isAdmin = useIsAdminUser()
  const cardsData = useMemo(() => homeCardsForAdmin(isAdmin), [isAdmin])
  const VISIBLE_COUNT = Math.min(5, cardsData.length)
  const initialOrder = Array.from({ length: cardsData.length }, (_, i) => i)
  const [order, setOrder] = useState<number[]>(initialOrder)
  const { wallets, demoMode } = useWalletStore()
  const isBalanceReady = useAppModeStore((s) => s.isBalanceReady())
  const walletMzn = Number(wallets?.cashMZN?.fiatBalance || 0)
  const walletZar = Number(wallets?.cashZAR?.fiatBalance || 0)
  const walletTransitZar = Number(wallets?.earnings?.fiatBalance || 0)
  const mznWallet = wallets?.cashMZN as
    | { liquidityQueuedAtMs?: number; updatedAt?: { toMillis?: () => number } | number }
    | undefined
  // Drip from when this MZN episode landed — never replay every cycle since 09:00.
  const mznSinceMs =
    Number(mznWallet?.liquidityQueuedAtMs) > 0
      ? Number(mznWallet?.liquidityQueuedAtMs)
      : typeof mznWallet?.updatedAt === 'number'
        ? mznWallet.updatedAt
        : typeof mznWallet?.updatedAt?.toMillis === 'function'
          ? mznWallet.updatedAt.toMillis()
          : null
  const liveMzn =
    typeof fxRates?.rates?.MZN === 'number' && fxRates.rates.MZN > 0 ? fxRates.rates.MZN : 0
  const transitClock = useTransitDayClock({
    enabled: Boolean(isBalanceReady && !demoMode),
    walletMzn,
    walletZar,
    walletTransitZar,
    sellMznPerZar: sellMznPerZar(liveMzn),
    mznSinceMs,
  })
  const [isAnimating, setIsAnimating] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'animating'>('idle')
  /** Holds back TRANSIT R so the up-tick plays after shuffle, not under the source card. */
  const [transitCreditHold, setTransitCreditHold] = useState(0)
  const [zarCreditHold, setZarCreditHold] = useState(0)
  const [mznCreditHold, setMznCreditHold] = useState(0)
  const storyPlayingRef = useRef(false)
  const walletStoryPrevRef = useRef<{ cashZAR: number; cashMZN: number; earnings: number } | null>(
    null
  )
  const touchStartY = useRef<number>(0)
  const touchEndY = useRef<number>(0)
  const inventoryOrderAppliedRef = useRef(false)
  // Live stack position for chained flipToCard awaits (stale React state would skip the Opt2 return).
  const orderRef = useRef(order)
  const isAnimatingRef = useRef(isAnimating)
  orderRef.current = order
  isAnimatingRef.current = isAnimating

  // Special mode state for credit surprise animation
  const [specialMode, setSpecialMode] = useState<'credit' | null>(null)
  const [specialCardType, setSpecialCardType] = useState<CardType | null>(null)
  
  // Track if credit has been applied for this reveal (prevent multiple credits)
  const hasCreditedRef = useRef(false)

  // Flash state: track direction for each card type
  // Note: alloc values are now read in CardStackCard component
  const { alloc } = useWalletAlloc()
  const isAuthed = useAuthStore((state) => state.isAuthed)

  useEffect(() => {
    setOrder(Array.from({ length: cardsData.length }, (_, i) => i))
    inventoryOrderAppliedRef.current = false
  }, [cardsData])

  // Land with the heavier inventory card on top (MZN vs ZAR in ZAR terms).
  useEffect(() => {
    if (!isAuthed) {
      inventoryOrderAppliedRef.current = false
      return
    }
    if (!isBalanceReady || demoMode || inventoryOrderAppliedRef.current) return
    if (!(liveMzn > 0) && walletMzn > 0) return
    inventoryOrderAppliedRef.current = true
    // Inventory @ sell: MZN card + ZAR book (liquid + in-route) = total corridor stock.
    const zarBook = walletZar + walletTransitZar
    const dominant = inventoryDominantCard(walletMzn, zarBook, sellMznPerZar(liveMzn))
    const dominantIdx = cardsData.findIndex((c) => c.type === dominant)
    if (dominantIdx < 0) return
    setOrder(() => {
      const rest = cardsData.map((_, i) => i).filter((i) => i !== dominantIdx)
      return [dominantIdx, ...rest]
    })
  }, [isAuthed, isBalanceReady, demoMode, liveMzn, walletMzn, walletZar, walletTransitZar, cardsData])

  const [flashDirection, setFlashDirection] = useState<Record<CardType, 'up' | 'down' | null>>({
    savings: null,
    zwd: null,
    yield: null,
    mzn: null,
    btc: null,
    yieldSurprise: null,
  })
  // Track previous values to compute direction
  // CRITICAL: For authenticated users, initialize to zero to prevent flash animation
  // when alloc changes from DEMO (initial render) to ZERO (after auth state determined)
  const prevValuesRef = useRef<Record<CardType, number>>({
    savings: isAuthed ? 0 : alloc.cashCents / 100,
    zwd: isAuthed ? 0 : alloc.zwdCents / 100,
    yield: isAuthed ? 0 : alloc.ethCents / 100,
    mzn: isAuthed ? 0 : ((alloc as any).mznCents ? (alloc as any).mznCents / 100 : 0),
    btc: isAuthed ? 0 : ((alloc as any).btcCents ? (alloc as any).btcCents / 100 : 0),
    yieldSurprise: isAuthed ? 0 : alloc.earningsCents / 100, // Earnings card has its own balance
  })
  
  // Track if this is the first hydration for authenticated users (skip flash on first sync)
  const isFirstHydrationRef = useRef(true)

  // Reset prevValuesRef when auth state changes to prevent false flash animations
  useEffect(() => {
    if (isAuthed) {
      // When user becomes authenticated, reset prevValuesRef to zero
      // This prevents flash animation when alloc changes from DEMO to ZERO
      prevValuesRef.current = {
        savings: 0,
        zwd: 0,
        yield: 0,
        mzn: 0,
        btc: 0,
        yieldSurprise: 0,
      }
      isFirstHydrationRef.current = true
    } else {
      // When user signs out, reset to current alloc values (demo)
      prevValuesRef.current = {
        savings: alloc.cashCents / 100,
        zwd: alloc.zwdCents / 100,
        yield: alloc.ethCents / 100,
        mzn: (alloc as any).mznCents ? (alloc as any).mznCents / 100 : 0,
        btc: (alloc as any).btcCents ? (alloc as any).btcCents / 100 : 0,
        yieldSurprise: alloc.earningsCents / 100,
      }
      isFirstHydrationRef.current = false
    }
  }, [isAuthed, alloc.cashCents, alloc.zwdCents, alloc.ethCents, alloc.earningsCents])

  // Compute flash direction when values change
  useEffect(() => {
    const currentValues: Record<CardType, number> = {
      savings: alloc.cashCents / 100,
      zwd: alloc.zwdCents / 100,
      yield: alloc.ethCents / 100,
      mzn: (alloc as any).mznCents ? (alloc as any).mznCents / 100 : 0,
      btc: (alloc as any).btcCents ? (alloc as any).btcCents / 100 : 0,
      yieldSurprise: alloc.earningsCents / 100, // Earnings card has its own balance
    }

    const newFlashDirection: Record<CardType, 'up' | 'down' | null> = {
      savings: null,
      zwd: null,
      yield: null,
      mzn: null,
      btc: null,
      yieldSurprise: null,
    }

    // Skip flash animation on first hydration for authenticated users
    // This prevents false flash when wallets sync from Firestore (zero balances)
    if (isAuthed && isFirstHydrationRef.current) {
      // Check if this is the first sync (all values are zero or very close to zero)
      const allZero = Object.values(currentValues).every(v => Math.abs(v) < 0.005)
      if (allZero) {
        // First hydration with zero balances - skip flash, just update prevValuesRef
        prevValuesRef.current = currentValues
        isFirstHydrationRef.current = false
        return
      }
      // If not all zero, this might be a real change, so allow flash
      isFirstHydrationRef.current = false
    }

    // Compute direction for each card
    ;(['savings', 'zwd', 'yield', 'mzn', 'btc', 'yieldSurprise'] as CardType[]).forEach((cardType) => {
      const prev = prevValuesRef.current[cardType]
      const current = currentValues[cardType]
      const delta = current - prev

      // Debounce tiny changes (less than half a cent)
      if (Math.abs(delta) < 0.005) {
        newFlashDirection[cardType] = null
      } else if (delta > 0) {
        newFlashDirection[cardType] = 'up'
      } else if (delta < 0) {
        newFlashDirection[cardType] = 'down'
      }

      // Update previous value AFTER computing direction
      // (so next change can compare against this value)
      prevValuesRef.current[cardType] = current
    })

    // Update flash direction state (this triggers re-render with flash classes)
    setFlashDirection(newFlashDirection)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alloc.cashCents, alloc.zwdCents, alloc.ethCents, alloc.earningsCents, (alloc as any).mznCents, (alloc as any).btcCents, isAuthed])

  // Notify parent of top card change
  useEffect(() => {
    if (onTopCardChange) {
      const topCardIndex = order[0]
      const topCard = cardsData[topCardIndex]
      if (topCard) {
        onTopCardChange(topCard.type)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order])

  // Get card index by type
  const getCardIndex = useCallback((cardType: CardType): number => {
    return cardsData.findIndex((c) => c.type === cardType)
  }, [cardsData])

  // Flip to a specific card type
  const flipToCard = useCallback(
    async (targetCardType: CardType, _direction: 'forward' | 'back' = 'forward'): Promise<void> => {
      const targetIndex = getCardIndex(targetCardType)
      if (targetIndex === -1) return

      // Read live order — chained awaits in playConversionStory must not see a stale top card.
      const liveOrder = orderRef.current
      const currentTopIndex = liveOrder[0]
      if (currentTopIndex === targetIndex) {
        return // Already on top
      }

      const targetPosition = liveOrder.indexOf(targetIndex)
      if (targetPosition <= 0) return

      const cyclesNeeded = targetPosition

      return new Promise((resolve) => {
        let pollCount = 0
        const MAX_POLL_COUNT = 20 // Maximum number of times to poll (20 * 350ms = 7 seconds max wait)

        const performCycle = (remaining: number) => {
          if (remaining === 0) {
            resolve()
            return
          }

          if (isAnimatingRef.current) {
            pollCount++
            // Safety: If we've been waiting too long, resolve anyway to prevent infinite blocking
            if (pollCount > MAX_POLL_COUNT) {
              console.warn('[flipToCard] Max poll count reached, resolving to prevent infinite wait')
              resolve()
              return
            }
            // Wait for current animation to finish with exponential backoff (capped)
            const waitTime = Math.min(FLIP_DURATION_MS + 50, 500)
            setTimeout(() => performCycle(remaining), waitTime)
            return
          }

          // Reset poll count when we can proceed
          pollCount = 0
          isAnimatingRef.current = true
          setIsAnimating(true)
          setPhase('animating')

          setTimeout(() => {
            setOrder((prevOrder) => {
              const next = [...prevOrder.slice(1), prevOrder[0]]
              orderRef.current = next
              return next
            })
            setPhase('idle')
            isAnimatingRef.current = false
            setIsAnimating(false)

            // Continue with next cycle if needed
            if (remaining > 1) {
              setTimeout(() => performCycle(remaining - 1), 50)
            } else {
              resolve()
            }
          }, FLIP_DURATION_MS)
        }

        performCycle(cyclesNeeded)
      })
    },
    [getCardIndex]
  )

  const cycle = () => {
    if (isAnimating) return

    setIsAnimating(true)
    setPhase('animating')

    setTimeout(() => {
      setOrder((prevOrder) => [...prevOrder.slice(1), prevOrder[0]])
      setPhase('idle')
      setIsAnimating(false)
    }, FLIP_DURATION_MS)
  }

  // Expose cycleNext for external control
  const cycleNext = () => {
    cycle()
  }

  // Reveal credit surprise: bring yieldSurprise card to top with special animation
  const revealCreditSurprise = useCallback(() => {
    // Prevent multiple simultaneous surprises
    if (specialMode === 'credit' || isAnimating) return

    // Reset credit flag for new reveal
    hasCreditedRef.current = false

    // Pause random flips during the surprise
    if (externalFlipControllerRef?.current) {
      externalFlipControllerRef.current.pause()
    }

    // Find yieldSurprise card index
    const yieldSurpriseIndex = cardsData.findIndex((c) => c.type === 'yieldSurprise')
    if (yieldSurpriseIndex === -1) return

    // Find current position of yieldSurprise in order
    const currentPosition = order.indexOf(yieldSurpriseIndex)
    if (currentPosition < 0) return

    // If already at top, just trigger the animation
    if (currentPosition === 0) {
      setSpecialCardType('yieldSurprise')
      setSpecialMode('credit')
      
      // Trigger credit after small delay to align with wobble animation
      if (onCreditSurprise && !hasCreditedRef.current) {
        setTimeout(() => {
          onCreditSurprise(500) // R500 credit
          hasCreditedRef.current = true
        }, 300) // ~300ms delay to align with wobble
      }
      
      // End special mode after animation
      setTimeout(() => {
        setSpecialMode(null)
        setSpecialCardType(null)
        hasCreditedRef.current = false // Reset credit flag
        if (externalFlipControllerRef?.current) {
          externalFlipControllerRef.current.resume()
        }
      }, 1200)
      return
    }

    // Rotate order to bring yieldSurprise to top
    setOrder((prevOrder) => {
      const pos = prevOrder.indexOf(yieldSurpriseIndex)
      if (pos <= 0) return prevOrder
      // Rotate so yieldSurprise goes to index 0
      return [...prevOrder.slice(pos), ...prevOrder.slice(0, pos)]
    })

    // Wait for rotation to complete, then trigger special animation
    setTimeout(() => {
      setSpecialCardType('yieldSurprise')
      setSpecialMode('credit')

      // Trigger credit after small delay to align with wobble animation
      if (onCreditSurprise && !hasCreditedRef.current) {
        setTimeout(() => {
          onCreditSurprise(500) // R500 credit
          hasCreditedRef.current = true
        }, 300) // ~300ms delay to align with wobble
      }

      // End special mode after animation
      setTimeout(() => {
        setSpecialMode(null)
        setSpecialCardType(null)
        hasCreditedRef.current = false // Reset credit flag
        if (externalFlipControllerRef?.current) {
          externalFlipControllerRef.current.resume()
        }
      }, 1200)
    }, FLIP_DURATION_MS + 50) // Wait for any ongoing animation + buffer
  }, [order, specialMode, isAnimating, externalFlipControllerRef, onCreditSurprise])

  const playConversionStory = useCallback(
    async (story: ConversionStory) => {
      if (storyPlayingRef.current) return
      storyPlayingRef.current = true
      externalFlipControllerRef?.current?.pause()
      aiCycleControllerRef?.current?.pause()

      const instantAmt = Math.round((Number(story.instant?.amount) || 0) * 100) / 100
      const routedAmt = Math.round((Number(story.routed?.amount) || 0) * 100) / 100
      const instantCard = story.instant?.card

      // Hold destination credits so they appear only after the flip.
      if (instantCard === 'savings' && instantAmt > 0) setZarCreditHold(instantAmt)
      if (instantCard === 'mzn' && instantAmt > 0) setMznCreditHold(instantAmt)
      if (routedAmt > 0) setTransitCreditHold(routedAmt)

      // Source debit is already in wallets — let flash-down read.
      setFlashDirection((prev) => ({ ...prev, [story.sourceCard]: 'down' }))
      await sleep(SHOCK_SOURCE_FLASH_MS)

      const releaseInstant = async () => {
        if (!instantCard || !(instantAmt > 0)) return
        try {
          await flipToCard(instantCard, 'forward')
        } catch {
          /* still release holds */
        }
        if (instantCard === 'savings') setZarCreditHold(0)
        if (instantCard === 'mzn') setMznCreditHold(0)
        setFlashDirection((prev) => ({ ...prev, [instantCard]: 'up' }))
        await sleep(SHOCK_DEST_FLASH_MS)
      }

      const releaseRouted = async () => {
        if (!(routedAmt > 0)) return
        // ROUTE is collapsed into ZAR — flip/flash the ZAR card for in-transit credit.
        try {
          await flipToCard('savings', 'forward')
        } catch {
          /* still release holds */
        }
        setTransitCreditHold(0)
        setFlashDirection((prev) => ({ ...prev, savings: 'up' }))
        await sleep(SHOCK_DEST_FLASH_MS)
      }

      try {
        if (story.kind === 'reserve_only' || story.kind === 'clear_to_zar' || story.kind === 'clear_to_mzn') {
          await releaseInstant()
        } else if (story.kind === 'partial_liquid') {
          // Opt2: MZN↓ → ZAR↑ → flip back so residual MZN is visible.
          await releaseInstant()
          try {
            await flipToCard(story.sourceCard, 'forward')
          } catch {
            /* leave on ZAR if flip fails */
          }
          await sleep(SHOCK_DEST_FLASH_MS)
        } else if (story.kind === 'queued_liquid') {
          // Opt3: glance at ZAR (R0) then return to queued MZN.
          try {
            await flipToCard('savings', 'forward')
          } catch {
            /* still return */
          }
          await sleep(SHOCK_DEST_FLASH_MS)
          try {
            await flipToCard(story.sourceCard, 'forward')
          } catch {
            /* stay */
          }
          await sleep(SHOCK_DEST_FLASH_MS)
        } else if (story.kind === 'route_only') {
          await releaseRouted()
        } else if (story.kind === 'split') {
          await releaseInstant()
          await releaseRouted()
        }
      } finally {
        setZarCreditHold(0)
        setMznCreditHold(0)
        setTransitCreditHold(0)
        externalFlipControllerRef?.current?.resume()
        aiCycleControllerRef?.current?.resume()
        storyPlayingRef.current = false
      }
    },
    [flipToCard, externalFlipControllerRef, aiCycleControllerRef]
  )

  const playCapitalShockReveal = useCallback(
    async (params: { creditZar: number }) => {
      const credit = Math.round((Number(params.creditZar) || 0) * 100) / 100
      if (!(credit > 0)) return
      // Legacy: treat as ROUTE-only credit (pre-reserve callers).
      await playConversionStory({
        kind: 'route_only',
        sourceCard: 'mzn',
        routed: { amount: credit },
      })
    },
    [playConversionStory]
  )

  useEffect(() => {
    setConversionStoryPlayer((story) => {
      void playConversionStory(story)
    })
    return () => setConversionStoryPlayer(null)
  }, [playConversionStory])

  // 09:00 clear / inferred wallet stories when no explicit conversion story is playing.
  useEffect(() => {
    if (!isAuthed || !isBalanceReady || demoMode) return
    const next = {
      cashZAR: walletZar,
      cashMZN: walletMzn,
      earnings: walletTransitZar,
    }
    const prev = walletStoryPrevRef.current
    walletStoryPrevRef.current = next
    if (!prev) return
    if (storyPlayingRef.current || inferredStoriesSuppressed()) return
    const story = conversionStoryFromWalletTransition(prev, next)
    if (!story) return
    // Clears (09:00) and reserve-instant auto-converts (Opt1 full / Opt2 partial)
    // have no submit path — play the card story here.
    if (
      story.kind !== 'clear_to_zar' &&
      story.kind !== 'clear_to_mzn' &&
      story.kind !== 'reserve_only' &&
      story.kind !== 'partial_liquid'
    ) {
      return
    }
    void playConversionStory(story)
  }, [
    isAuthed,
    isBalanceReady,
    demoMode,
    walletZar,
    walletMzn,
    walletTransitZar,
    playConversionStory,
  ])

  // Desk liquid_now backup: Opt3 always; Opt2 if wallet inference missed the debit step.
  const activityItems = useActivityStore((s) => s.items)
  const queuedStorySeenRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!isAuthed || !isBalanceReady || demoMode) return
    if (storyPlayingRef.current || inferredStoriesSuppressed()) return
    const now = Date.now()
    for (const item of activityItems) {
      if (item.routingAction !== 'liquid_now') continue
      if (queuedStorySeenRef.current.has(item.id)) continue
      // Skip hydration / history — only live arrivals.
      if (!(item.createdAt > 0) || now - item.createdAt > 25_000) {
        queuedStorySeenRef.current.add(item.id)
        continue
      }
      const mode =
        item.liquidNowMode ||
        ((typeof item.amount?.value === 'number' &&
          item.amount.value <= 0.005 &&
          /queued for liquidity/i.test(item.title || '')
          ? 'none'
          : undefined) as 'full' | 'partial' | 'none' | undefined)
      if (mode === 'none') {
        queuedStorySeenRef.current.add(item.id)
        requestConversionStory({
          kind: 'queued_liquid',
          sourceCard: 'mzn',
          instant: { card: 'savings', amount: 0 },
        })
        break
      }
      if (mode === 'partial') {
        const zarOut = Math.round((Number(item.amount?.value) || 0) * 100) / 100
        if (!(zarOut > 0.005)) {
          queuedStorySeenRef.current.add(item.id)
          continue
        }
        queuedStorySeenRef.current.add(item.id)
        requestConversionStory({
          kind: 'partial_liquid',
          sourceCard: 'mzn',
          instant: { card: 'savings', amount: zarOut },
        })
        break
      }
      queuedStorySeenRef.current.add(item.id)
    }
  }, [activityItems, isAuthed, isBalanceReady, demoMode])

  useImperativeHandle(ref, () => ({
    cycleNext,
    flipToCard,
    revealCreditSurprise,
    playCapitalShockReveal,
    playConversionStory,
  }))

  const handleCardClick = (index: number) => {
    // Only respond if this card is the top card (order[0])
    if (order[0] === index && !isAnimating) {
      // If parent provides onCardClick (auth guard), call it first
      if (onCardClick) {
        onCardClick()
      }
      // Internal cycling logic (always runs if card is top card)
      cycle()
    }
  }

  const handleTouchStart = (e: React.TouchEvent, index: number) => {
    if (order[0] === index) {
      touchStartY.current = e.touches[0].clientY
    }
  }

  const handleTouchEnd = (e: React.TouchEvent, index: number) => {
    if (order[0] === index) {
      touchEndY.current = e.changedTouches[0].clientY
      const swipeDistance = touchStartY.current - touchEndY.current
      const minSwipeDistance = 50

      // Swipe up detected
      if (swipeDistance > minSwipeDistance && !isAnimating) {
        cycle()
      }
    }
  }

  const getCardClasses = (index: number, depth: number) => {
    const isTop = depth === 0
    const isCyclingOut = isTop && phase === 'animating'

    // During animation, cards move up one position
    const effectiveDepth = phase === 'animating' && depth > 0 ? depth - 1 : depth

    // Use computed styles instead of hardcoded classes
    // Keep base card class for transitions and hover effects
    return `${CARD_FLIP_CLASSES.card} ${isCyclingOut ? CARD_FLIP_CLASSES.cyclingOut : ''} ${!isTop ? CARD_FLIP_CLASSES.noHover : ''}`
  }

  // Debug logging when flag is enabled
  useEffect(() => {
    if (DEV_CARD_FLIP_DEBUG) {
      console.debug('[CardFlip]', 'CardStack', 'mounted')
    }
  }, [])

  // Note: cardsData.length === 6, but only VISIBLE_COUNT (5) cards are rendered
  const total = cardsData.length
  // BASE_HEIGHT_PX: estimated top card height for stack container sizing (cards now use aspect-ratio: 86/54)
  // This is approximate - actual card height varies by width, but we use it for container min-height calculation
  const BASE_HEIGHT_PX = 238 // approximate top card height for container sizing
  const Y_STEP_PX = 44 // vertical offset per depth (from getStackStyle)

  // Debug: log computed styles on first render
  useEffect(() => {
    if (DEV_CARD_FLIP_DEBUG) {
      console.log('[CardStack] Computed styles for', VISIBLE_COUNT, 'visible cards:')
      for (let depth = 0; depth < VISIBLE_COUNT; depth++) {
        const style = getStackStyle(depth, VISIBLE_COUNT)
        console.log(`  Depth ${depth}:`, style)
      }
    }
  }, [])

  // Calculate dynamic minHeight to accommodate visible cards with overlap
  // Use VISIBLE_COUNT for height calculation to maintain consistent stack height
  const BOTTOM_BUFFER_PX = 0 // Reduced from 20 to 0 to close gap to map section (80% total reduction - removed buffer entirely)
  const stackMinHeight = BASE_HEIGHT_PX + (VISIBLE_COUNT - 1) * Y_STEP_PX + BOTTOM_BUFFER_PX

  // ZAR green bar = dripped ÷ next-09:00 liquidity available (≤ R100k), not 09→09 clock.
  const sellForBar = sellMznPerZar(liveMzn)
  const zarJourneyBarPercent = zarLiquidityJourneyBarPercent({
    walletMzn,
    drippedZar: Math.max(0, transitClock.displayTransitZarOffset - transitCreditHold),
    sellMznPerZar: sellForBar,
  })
  // No residual left: fall back to liquid share of the combined ZAR book.
  const zarLiquidMajor = Math.max(0, walletZar - zarCreditHold)
  const zarInRouteMajor = Math.max(
    0,
    walletTransitZar + transitClock.displayTransitZarOffset - transitCreditHold
  )
  const zarBookMajor = zarLiquidMajor + zarInRouteMajor
  const zarLiquidSharePercent =
    zarBookMajor > 0.005
      ? Math.max(0, Math.min(100, (zarLiquidMajor / zarBookMajor) * 100))
      : 0
  const zarLiquidBarPercent =
    walletMzn > 0.005 ? zarJourneyBarPercent : zarLiquidSharePercent

  return (
    <div 
      className={CARD_FLIP_CLASSES.stack}
      style={{
        position: 'relative',
        overflow: 'visible', // Changed from 'hidden' to prevent card border-radius clipping
        minHeight: stackMinHeight,
      }}
    >
      {order.map((cardIdx, depth) => {
        // Only render the first VISIBLE_COUNT cards (depths 0-4)
        // Cards at depth >= VISIBLE_COUNT are hidden but still part of the logical order
        if (depth >= VISIBLE_COUNT) return null

        const card = cardsData[cardIdx]
        const isTop = depth === 0
        // Use VISIBLE_COUNT for stack style calculation to maintain consistent 5-card spacing
        const stackStyle = getStackStyle(depth, VISIBLE_COUNT)

        // During animation, adjust depth for smooth transitions
        // IMPORTANT: Never adjust depth for top card (depth === 0) to prevent clipping
        const effectiveDepth = phase === 'animating' && depth > 0 ? depth - 1 : depth
        const effectiveStyle = phase === 'animating' && depth > 0 ? getStackStyle(effectiveDepth, VISIBLE_COUNT) : stackStyle
        
        // Ensure top card (depth 0) always has consistent top position, even during animation
        const finalTop = depth === 0 ? stackStyle.top : effectiveStyle.top

        if (DEV_CARD_FLIP_DEBUG && isTop) {
          console.debug('[CardFlip]', `CardStack-${cardIdx}`, 'top card rendered')
        }

        // Determine if this card is in special mode
        const isSpecialMode = specialMode === 'credit'
        const isSpecialCard = isSpecialMode && card.type === specialCardType

        return (
          <CardStackCard
            key={cardIdx}
            card={card}
            index={cardIdx}
            position={depth}
            depth={depth}
            total={VISIBLE_COUNT}
            isTop={isTop}
            className={getCardClasses(cardIdx, depth)}
            onClick={() => handleCardClick(cardIdx)}
            onTouchStart={(e) => handleTouchStart(e, cardIdx)}
            onTouchEnd={(e) => handleTouchEnd(e, cardIdx)}
            onApyPillClick={onApyPillClick}
            fxRates={fxRates}
            style={{
              position: 'absolute',
              width: effectiveStyle.width,
              maxWidth: `${effectiveStyle.maxWidth}px`,
              // height removed: card height is now determined by .card-canvas aspect-ratio (86/54)
              top: `${finalTop}px`, // Use finalTop to ensure depth 0 never moves up
              left: `${effectiveStyle.left}px`,
              zIndex: effectiveStyle.zIndex,
              pointerEvents: isTop ? 'auto' : 'none',
              boxSizing: 'border-box',
              transition: 'width 300ms ease, top 300ms ease, left 300ms ease, box-shadow 300ms ease, opacity 300ms ease, transform 300ms ease',
            }}
            flashDirection={flashDirection[card.type]}
            onFlashEnd={() => {
              setFlashDirection((prev) => ({ ...prev, [card.type]: null }))
            }}
            isSpecialMode={isSpecialMode}
            isSpecialCard={isSpecialCard}
            timeBarPercent={
              card.type === 'mzn'
                ? transitClock.mznBarPercent
                : card.type === 'savings'
                  ? zarLiquidBarPercent
                  : null
            }
            displayMajorOffset={
              // Shared drip projection (deterministic) + brief story holds.
              card.type === 'mzn'
                ? transitClock.displayMznOffset - mznCreditHold
                : card.type === 'savings'
                  ? walletTransitZar +
                    transitClock.displayTransitZarOffset -
                    zarCreditHold -
                    transitCreditHold
                  : 0
            }
          />
        )
      })}
    </div>
  )
})

export default CardStack

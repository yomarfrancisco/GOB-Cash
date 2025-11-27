'use client'

import Image from 'next/image'
import { useState, useRef, useEffect, forwardRef, useImperativeHandle, useCallback } from 'react'
import type React from 'react'
import type { StaticImageData } from 'next/image'
import { CARD_FLIP_CLASSES } from '@/lib/animations/cardFlipClassNames'
import { DEV_CARD_FLIP_DEBUG } from '@/lib/flags'
import { FLIP_MS } from '@/lib/animations/useAiActionCycle'
import { useWalletAlloc } from '@/state/walletAlloc'
import { getStackStyle } from '@/lib/stack/getStackStyle'
import CardStackCard from './CardStackCard'

// Temporary FX rate (will be wired to real API later)
const FX_USD_ZAR_DEFAULT = 18.1

// Health levels: 'good' | 'moderate' | 'fragile'
type HealthLevel = 'good' | 'moderate' | 'fragile'

// Health configuration per card type
const HEALTH_CONFIG: Record<CardType, { level: HealthLevel; percent: number }> = {
  savings: { level: 'good', percent: 100 },
  pepe: { level: 'fragile', percent: 25 },
  yield: { level: 'moderate', percent: 60 },
  mzn: { level: 'good', percent: 100 },
  btc: { level: 'moderate', percent: 15 },
  yieldSurprise: { level: 'moderate', percent: 60 }, // Reuse yield card health config
}

export type CardType = 'pepe' | 'savings' | 'yield' | 'mzn' | 'btc' | 'yieldSurprise'

interface CardData {
  type: CardType
  image: string | StaticImageData
  alt: string
  width: number
  height: number
}

const cardsData: CardData[] = [
  {
    type: 'savings',
    image: '/assets/cards/card-savings.jpg',
    alt: 'Cash Card',
    width: 342,
    height: 213,
  },
  {
    type: 'pepe',
    image: '/assets/cards/card-pepe.jpg',
    alt: 'PEPE Card',
    width: 398,
    height: 238,
  },
  {
    type: 'yield',
    image: '/assets/cards/card-ETH.jpg',
    alt: 'Yield Card',
    width: 310,
    height: 193,
  },
  {
    type: 'mzn',
    image: '/assets/cards/card-MZN.jpg',
    alt: 'MZN Cash Card',
    width: 342,
    height: 213,
  },
  {
    type: 'btc',
    image: '/assets/cards/card-BTC.jpg',
    alt: 'BTC Card',
    width: 342,
    height: 213,
  },
  {
    type: 'yieldSurprise',
    image: '/assets/cards/card-yield.jpg',
    alt: 'Yield Surprise Card',
    width: 310,
    height: 193,
  },
]

// Card labels mapping
const CARD_LABELS: Record<CardType, string> = {
  savings: 'CASH CARD',
  pepe: 'CASH CARD',
  yield: 'CASH CARD',
  mzn: 'CASH CARD',
  btc: 'CASH CARD',
  yieldSurprise: 'CASH CARD', // Reuse yield card label
}

// Map card type to allocation key
const CARD_TO_ALLOC_KEY: Record<CardType, 'cashCents' | 'ethCents' | 'pepeCents' | 'mznCents' | 'btcCents'> = {
  savings: 'cashCents',
  pepe: 'pepeCents',
  yield: 'ethCents',
  mzn: 'mznCents',
  btc: 'btcCents',
  yieldSurprise: 'ethCents', // Reuse yield card allocation (ethCents)
}

// Map card type to portfolio symbol
const CARD_TO_SYMBOL: Record<CardType, 'CASH' | 'ETH' | 'PEPE' | 'MZN' | 'BTC'> = {
  savings: 'CASH',
  pepe: 'PEPE',
  yield: 'ETH',
  mzn: 'MZN',
  btc: 'BTC',
  yieldSurprise: 'ETH', // Reuse yield card symbol (ETH)
}

interface CardStackProps {
  onTopCardChange?: (cardType: CardType) => void
  flipControllerRef?: React.MutableRefObject<{ pause: () => void; resume: () => void } | null>
  onCardClick?: () => void // Optional auth guard wrapper for card clicks
}

export type CardStackHandle = {
  cycleNext: () => void
  flipToCard: (cardType: CardType, direction?: 'forward' | 'back') => Promise<void>
  revealCreditSurprise: () => void
}

const FLIP_DURATION_MS = FLIP_MS

// Number of cards visible in the stack at any time
const VISIBLE_COUNT = 5

const CardStack = forwardRef<CardStackHandle, CardStackProps>(function CardStack({ onTopCardChange, flipControllerRef: externalFlipControllerRef, onCardClick }, ref) {
  // Dynamic order initialization based on cards.length
  // Note: order.length === 6 (includes hidden card), but only first VISIBLE_COUNT are rendered
  const initialOrder = Array.from({ length: cardsData.length }, (_, i) => i)
  const [order, setOrder] = useState<number[]>(initialOrder)
  const [isAnimating, setIsAnimating] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'animating'>('idle')
  const touchStartY = useRef<number>(0)
  const touchEndY = useRef<number>(0)

  // Special mode state for credit surprise animation
  const [specialMode, setSpecialMode] = useState<'credit' | null>(null)
  const [specialCardType, setSpecialCardType] = useState<CardType | null>(null)

  // Flash state: track direction for each card type
  // Note: alloc values are now read in CardStackCard component
  const { alloc } = useWalletAlloc()
  const [flashDirection, setFlashDirection] = useState<Record<CardType, 'up' | 'down' | null>>({
    savings: null,
    pepe: null,
    yield: null,
    mzn: null,
    btc: null,
    yieldSurprise: null,
  })
  // Track previous values to compute direction
  const prevValuesRef = useRef<Record<CardType, number>>({
    savings: alloc.cashCents / 100,
    pepe: alloc.pepeCents / 100,
    yield: alloc.ethCents / 100,
    mzn: (alloc as any).mznCents ? (alloc as any).mznCents / 100 : 0,
    btc: (alloc as any).btcCents ? (alloc as any).btcCents / 100 : 0,
    yieldSurprise: alloc.ethCents / 100, // Reuse yield card allocation (ethCents)
  })

  // Compute flash direction when values change
  useEffect(() => {
    const currentValues: Record<CardType, number> = {
      savings: alloc.cashCents / 100,
      pepe: alloc.pepeCents / 100,
      yield: alloc.ethCents / 100,
      mzn: (alloc as any).mznCents ? (alloc as any).mznCents / 100 : 0,
      btc: (alloc as any).btcCents ? (alloc as any).btcCents / 100 : 0,
      yieldSurprise: alloc.ethCents / 100, // Reuse yield card allocation (ethCents)
    }

    const newFlashDirection: Record<CardType, 'up' | 'down' | null> = {
      savings: null,
      pepe: null,
      yield: null,
      mzn: null,
      btc: null,
      yieldSurprise: null,
    }

    // Compute direction for each card
    ;(['savings', 'pepe', 'yield', 'mzn', 'btc', 'yieldSurprise'] as CardType[]).forEach((cardType) => {
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
  }, [alloc.cashCents, alloc.pepeCents, alloc.ethCents, (alloc as any).mznCents, (alloc as any).btcCents])

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
  }, [])

  // Flip to a specific card type
  const flipToCard = useCallback(
    async (targetCardType: CardType, direction: 'forward' | 'back' = 'forward'): Promise<void> => {
      const targetIndex = getCardIndex(targetCardType)
      if (targetIndex === -1) return

      const currentTopIndex = order[0]
      if (currentTopIndex === targetIndex) {
        return // Already on top
      }

      // Find target position in current order
      const targetPosition = order.indexOf(targetIndex)

      // If target is already top, no flip needed
      if (targetPosition === 0) return

      // Calculate how many cycles needed
      let cyclesNeeded = targetPosition

      return new Promise((resolve) => {
        const performCycle = (remaining: number) => {
          if (remaining === 0) {
            resolve()
            return
          }

          if (isAnimating) {
            // Wait for current animation to finish
            setTimeout(() => performCycle(remaining), FLIP_DURATION_MS + 50)
            return
          }

          setIsAnimating(true)
          setPhase('animating')

          setTimeout(() => {
            setOrder((prevOrder) => [...prevOrder.slice(1), prevOrder[0]])
            setPhase('idle')
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
    [order, isAnimating, getCardIndex]
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
      
      // End special mode after animation
      setTimeout(() => {
        setSpecialMode(null)
        setSpecialCardType(null)
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

      // End special mode after animation
      setTimeout(() => {
        setSpecialMode(null)
        setSpecialCardType(null)
        if (externalFlipControllerRef?.current) {
          externalFlipControllerRef.current.resume()
        }
      }, 1200)
    }, FLIP_DURATION_MS + 50) // Wait for any ongoing animation + buffer
  }, [order, specialMode, isAnimating, externalFlipControllerRef])

  useImperativeHandle(ref, () => ({
    cycleNext,
    flipToCard,
    revealCreditSurprise,
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
  const BASE_HEIGHT_PX = 238 // top card height
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
            style={{
              position: 'absolute',
              width: effectiveStyle.width,
              maxWidth: `${effectiveStyle.maxWidth}px`,
              height: `${effectiveStyle.height}px`,
              top: `${finalTop}px`, // Use finalTop to ensure depth 0 never moves up
              left: `${effectiveStyle.left}px`,
              zIndex: effectiveStyle.zIndex,
              pointerEvents: isTop ? 'auto' : 'none',
              boxSizing: 'border-box',
              transition: 'width 300ms ease, height 300ms ease, top 300ms ease, left 300ms ease, box-shadow 300ms ease, opacity 300ms ease, transform 300ms ease',
            }}
            flashDirection={flashDirection[card.type]}
            onFlashEnd={() => {
              setFlashDirection((prev) => ({ ...prev, [card.type]: null }))
            }}
            isSpecialMode={isSpecialMode}
            isSpecialCard={isSpecialCard}
          />
        )
      })}
    </div>
  )
})

export default CardStack

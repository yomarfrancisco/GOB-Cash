'use client'

import { useEffect, useRef, useCallback } from 'react'
import type { CardStackHandle } from '@/components/CardStack'
import { useNotificationStore } from '@/store/notifications'
import { usePortfolioStore } from '@/store/portfolio'
import { computePostTrade, type HoldingsZAR } from '@/lib/portfolio/applyTrade'
import { derivePortfolio } from '@/lib/portfolio/calculateMetrics'
import { useAiFabHighlightStore, shouldHighlightAiFab } from '@/state/aiFabHighlight'
import { CHARACTERS } from '@/lib/demo/templates/characters'
import { useBabyCdoChatStore } from '@/state/babyCdoChat'
import { formatBabyCdoIntroFromTradeContext, type TradeContext } from '@/lib/babycdo/formatIntroMessage'
import { useAuthStore } from '@/store/auth'
import { useAppModeStore } from '@/store/appMode'
import { getDemoConfig, AI_ACTION_CONFIG } from '@/lib/demo/demoConfig'

const FX_USD_ZAR_DEFAULT = 18.1

type CardType = 'zwd' | 'savings' | 'yield'

export const FLIP_MS = 300 // do not change
export const CASH_UPDATE_DELAY_MS = FLIP_MS + 600 // small perceptible delay after flip back (doubled from 150, total was 450ms, now 900ms)
const SLOT_MS = 1400 // slot animation duration per update
const DELTA_MIN = 5 // USDT min move
const DELTA_MAX = 40 // USDT max move

type BalanceUpdaters = {
  getCash: () => number
  getEth: () => number
  getZwd: () => number
  setCash: (value: number) => void
  setEth: (value: number) => void
  setZwd: (value: number) => void
  onSlotUpdate?: (cardType: CardType, oldValue: number, newValue: number) => void
}

export function useAiActionCycle(
  cardStackRef: React.RefObject<CardStackHandle | null>,
  balanceUpdaters: BalanceUpdaters,
  enabled: boolean = true
) {
  const { isAuthed } = useAuthStore()
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const isRunningRef = useRef(false)
  const isProcessingRef = useRef(false)
  const isPausedRef = useRef(false)
  const pushNotification = useNotificationStore((state) => state.pushNotification)
  const setHoldingsBulk = usePortfolioStore((state) => state.setHoldingsBulk)
  const triggerAiFabHighlight = useAiFabHighlightStore((state) => state.triggerAiFabHighlight)

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  const rnd = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min

  const processAction = useCallback(async () => {
    // HARD KILL SWITCH: Stop if post-auth safe mode is active
    const { isPostAuthSafeMode } = useAppModeStore.getState()
    if (isPostAuthSafeMode()) {
      console.log('[SIM_DISABLED] AI action cycle blocked post-auth')
      return
    }
    
    // CRITICAL GATE: Check authState - only allow demo balance mutations when authState === 'unauthed'
    const authState = useAuthStore.getState().getAuthState()
    if (authState !== 'unauthed') {
      // Block demo balance mutations during loading or when authenticated
      return
    }
    
    // Hard stop for signed-in users - no auto-cycle post-auth (redundant check, but kept for safety)
    if (isAuthed) return
    if (isProcessingRef.current || !cardStackRef.current || isPausedRef.current) return
    isProcessingRef.current = true

    try {
      const { getCash, getEth, getZwd, setCash, setEth, setZwd } = balanceUpdaters

      // Read current holdings from portfolio store (single source of truth)
      const getHolding = usePortfolioStore.getState().getHolding
      const cashHolding = getHolding('CASH')
      const ethHolding = getHolding('ETH')
      const zwdHolding = getHolding('ZWD')

      // Get current ZAR amounts from portfolio store (single source of truth)
      // Fallback to wallet alloc if portfolio store not initialized
      // Note: wallet alloc stores everything in ZAR cents, so getCash/Eth/Zwd return ZAR
      const prev: HoldingsZAR = {
        CASH: cashHolding?.amountZAR ?? getCash(), // getCash() returns ZAR
        ETH: ethHolding?.amountZAR ?? getEth(), // getEth() returns ZAR (not USDT)
        ZWD: zwdHolding?.amountZAR ?? getZwd(), // getZwd() returns ZAR (not USDT)
      }

      // Get USDT balances for logic (from wallet alloc, convert ZAR to USDT)
      const eth = getEth() / FX_USD_ZAR_DEFAULT
      const zwd = getZwd() / FX_USD_ZAR_DEFAULT
      const cash = getCash()

      // Pick target: random among non-cash cards that have balance > 0
      const nonCashCards: Array<{ type: CardType; balance: number }> = []
      if (eth > 0) nonCashCards.push({ type: 'yield', balance: eth })
      // Note: ZWD is now a fiat card, so it's not included in nonCashCards

      // Suppress flips without balance changes - ensure we have a valid target
      if (nonCashCards.length === 0 && cash === 0) {
        // No valid action possible
        return
      }

      // Determine target and delta
      let targetType: CardType
      let delta: number // in USDT

      if (nonCashCards.length === 0 && cash > 0) {
        // If no non-cash cards have balance, allow buying from cash (only ETH now, ZWD is fiat)
        targetType = 'yield'
        delta = rnd(DELTA_MIN, Math.min(DELTA_MAX, Math.floor(cash / FX_USD_ZAR_DEFAULT)))
      } else {
        // Pick random non-cash card
        const target = nonCashCards[rnd(0, nonCashCards.length - 1)]
        targetType = target.type

        // Compute delta: random with sign (+/-) with guardrails
        const sign = Math.random() < 0.5 ? -1 : 1
        delta = rnd(DELTA_MIN, DELTA_MAX) * sign

        // Clamp: if selling, ensure we don't exceed target balance
        if (delta < 0 && Math.abs(delta) > target.balance) {
          delta = -target.balance
        }

        // Clamp: if buying, ensure we don't exceed available cash
        if (delta > 0) {
          const maxBuy = Math.floor(cash / FX_USD_ZAR_DEFAULT)
          if (delta > maxBuy) {
            delta = maxBuy
          }
        }
      }

      if (delta !== 0) {
        // Convert delta to ZAR
        const deltaZAR = delta * FX_USD_ZAR_DEFAULT
        const targetSymbol: 'ETH' = 'ETH' // Only ETH is crypto now, ZWD is fiat

        // Compute post-trade state using single source of truth
        const trade = { symbol: targetSymbol, deltaZAR }
        const { next: rawNext } = computePostTrade(prev, trade)

        // Get totalZAR from prev (should be constant at 6103.00)
        const totalZAR = prev.CASH + prev.ETH + prev.ZWD

        // Calculate raw percentages from post-trade amounts
        const rawCashPct = (rawNext.CASH / totalZAR) * 100
        const rawEthPct = (rawNext.ETH / totalZAR) * 100
        const rawZwdPct = (rawNext.ZWD / totalZAR) * 100

        // Derive portfolio using single source of truth function
        // This enforces allocation rules, ensures exact totals, and returns display percentages
        const portfolio = derivePortfolio({
          totalZAR,
          cashPct: rawCashPct,
          ethPct: rawEthPct,
          zwdPct: rawZwdPct,
          fx: FX_USD_ZAR_DEFAULT,
        })

        // Validation guardrails (dev only)
        const { holdings, displayPercents } = portfolio
        const pillSum = displayPercents.cash + displayPercents.eth + displayPercents.zwd
        const sumZAR = holdings.CASH.amountZAR + holdings.ETH.amountZAR + holdings.ZWD.amountZAR
        const sumDiff = Math.abs(sumZAR - totalZAR)
        const cashPct = holdings.CASH.allocationPct
        const ethPct = holdings.ETH.allocationPct
        const zwdPct = holdings.ZWD.allocationPct

        const isValid =
          pillSum === 100 &&
          sumDiff <= 0.01 &&
          (cashPct + zwdPct) >= 90 && // CASH + ZWD (fiat) ≥ 90%
          ethPct >= 0 &&
          zwdPct >= 0 &&
          ethPct <= 10

        if (!isValid) {
          console.error(
            '%c[PORTFOLIO VALIDATION FAILED]',
            'color: red; font-weight: bold;',
            {
              amounts: {
                CASH: holdings.CASH.amountZAR.toFixed(2),
                ETH: holdings.ETH.amountZAR.toFixed(2),
                ZWD: holdings.ZWD.amountZAR.toFixed(2),
                sum: sumZAR.toFixed(2),
                expected: totalZAR.toFixed(2),
                diff: sumDiff.toFixed(4),
              },
              percents: {
                cash: cashPct.toFixed(2),
                eth: ethPct.toFixed(2),
                zwd: zwdPct.toFixed(2),
                pillSum,
              },
            }
          )
          // Do not proceed if validation fails
          return
        }

        // Dev aid: log allocation percentages for verification
        console.info('[alloc]', {
          cashPct: cashPct.toFixed(2),
          ethPct: ethPct.toFixed(2),
          zwdPct: zwdPct.toFixed(2),
          sumPct: (cashPct + ethPct + zwdPct).toFixed(2),
          totalZAR: totalZAR.toFixed(2),
          displayPercents,
        })

        // 1) Flip forward to target
        if (cardStackRef.current && cardStackRef.current.flipToCard) {
          await cardStackRef.current.flipToCard(targetType, 'forward')
          await sleep(FLIP_MS + 50)
        }

        // 2) Batch update ALL holdings in portfolio store atomically
        // This triggers health/allocation tweens at t=0ms
        setHoldingsBulk({
          CASH: {
            symbol: 'CASH',
            amountZAR: holdings.CASH.amountZAR,
            amountUSDT: holdings.CASH.amountZAR / FX_USD_ZAR_DEFAULT,
            allocationPct: holdings.CASH.allocationPct,
            displayPct: displayPercents.cash,
            health: holdings.CASH.health,
          },
          ETH: {
            symbol: 'ETH',
            amountZAR: holdings.ETH.amountZAR,
            amountUSDT: holdings.ETH.amountZAR / FX_USD_ZAR_DEFAULT,
            allocationPct: holdings.ETH.allocationPct,
            displayPct: displayPercents.eth,
            health: holdings.ETH.health,
          },
          ZWD: {
            symbol: 'ZWD',
            amountZAR: holdings.ZWD.amountZAR,
            amountUSDT: holdings.ZWD.amountZAR / FX_USD_ZAR_DEFAULT,
            allocationPct: holdings.ZWD.allocationPct,
            displayPct: displayPercents.zwd,
            health: holdings.ZWD.health,
          },
        })

        // 3) Update wallet allocation (for slot counter animations)
        // Use the same derived amounts (single source of truth)
        const newTarget = holdings[targetSymbol].amountZAR / FX_USD_ZAR_DEFAULT
        const newCashValue = holdings.CASH.amountZAR / FX_USD_ZAR_DEFAULT

        // Only ETH is crypto now, ZWD is fiat (not part of crypto trading)
        if (targetType === 'yield') {
          setEth(newTarget)
        }
        // Note: ZWD is fiat, so it's not updated here (it's part of CASH allocation)

        // Emit AI trade notification
        const assetName = targetSymbol
        const zarAmount = Math.abs(deltaZAR)
        const actionVerb = delta > 0 ? 'bought' : 'sold'
        
        // Generate natural, conversational reasons based on the adjustment
        const isDefensive = delta < 0 // Moving to cash/stable assets
        const reasons = isDefensive
          ? [
              `Crypto looked nervous. Your money isn't.`,
              `Something felt off in the order books.`,
              `ZAR/MZN felt shaky this morning.`,
              `Caught movement before it hit.`,
              `Playing it safe for now.`,
              `Markets felt uncertain. Holding steady.`,
            ]
          : [
              `All clear. Storm passed.`,
              `Things calmed down.`,
              `Back to normal.`,
              `Conditions look good again.`,
            ]
        const shortWhyString = reasons[Math.floor(Math.random() * reasons.length)]
        
        // Determine title based on direction - natural, conversational
        const title = isDefensive
          ? '$ama: Moved to safety'
          : '$ama: Back to earning'
        
        // Action description - simple, natural language
        const actionDescription = isDefensive
          ? `Moved R${zarAmount.toFixed(2)} to cash.`
          : `Put R${zarAmount.toFixed(2)} back to work.`
        
        pushNotification({
          kind: 'ai_trade',
          title: title,
          action: actionDescription,
          reason: shortWhyString,
          amount: {
            currency: 'ZAR',
            value: delta > 0 ? -zarAmount : zarAmount,
          },
          direction: delta > 0 ? 'down' : 'up',
          actor: {
            type: 'ai_manager',
            name: '$ama',
            avatar: '/assets/Brics-girl-blue.png',
          },
          routeOnTap: '/transactions',
        })

        // Trigger FAB highlight for "important" trades (above R150 threshold)
        // $ama's AI trades - pass $ama's avatar
        if (shouldHighlightAiFab(zarAmount)) {
          triggerAiFabHighlight({
            reason: shortWhyString,
            amountZar: zarAmount,
            avatar: CHARACTERS.ama.avatar,
          })

          // Open BabyCDO chat with intro message for important trades
          const tradeContext: TradeContext = {
            action: `Rebalanced: ${actionVerb} ${Math.abs(delta)} ${assetName} (R${zarAmount.toFixed(2)}).`,
            reason: shortWhyString,
            amountZar: zarAmount,
            asset: assetName === 'ETH' ? 'ETH' : 'CASH', // Only ETH is crypto now
            direction: delta > 0 ? 'buy' : 'sell',
            timestamp: Date.now(),
          }
          
          const introText = formatBabyCdoIntroFromTradeContext(tradeContext)
          const { openWithIntro } = useBabyCdoChatStore.getState()
          
          // Open chat with intro message, auto-close after 12s if user ignores
          setTimeout(() => {
            openWithIntro(introText, 12000)
          }, 2000) // Small delay after FAB highlight
        }

        // 4) Wait for target slot animation (staggered: health/allocation start at 0ms, slot counter starts at ~120ms)
        await sleep(SLOT_MS)

        // 5) Flip back to Cash (reverse direction)
        if (cardStackRef.current && cardStackRef.current.flipToCard) {
          await cardStackRef.current.flipToCard('savings', 'back')
          await sleep(FLIP_MS + 50)
        }

        // 6) After flip back completes + delay, update cash (triggers slot animation)
        await sleep(CASH_UPDATE_DELAY_MS)
        setCash(newCashValue)

        // 7) Wait for cash slot animation
        await sleep(SLOT_MS)
      }
    } finally {
      isProcessingRef.current = false
    }
  }, [cardStackRef, balanceUpdaters, pushNotification, setHoldingsBulk, triggerAiFabHighlight, isAuthed])

  const start = useCallback(() => {
    if (isRunningRef.current) return
    isRunningRef.current = true

    const scheduleNext = () => {
      // HARD KILL SWITCH: Stop if post-auth safe mode is active
      const { isPostAuthSafeMode } = useAppModeStore.getState()
      if (isPostAuthSafeMode()) {
        console.log('[SIM_DISABLED] AI action cycle scheduling blocked post-auth')
        isRunningRef.current = false
        if (intervalRef.current) {
          clearTimeout(intervalRef.current)
          intervalRef.current = null
        }
        return
      }
      
      // Get current auth state and config
      const isAuthed = useAuthStore.getState().isAuthed
      const intensity = getDemoConfig(isAuthed)
      const config = AI_ACTION_CONFIG[intensity]
      
      // Use random interval for lively mode, fixed for calm mode
      const intervalMs = config.INTERVAL_MAX_MS > config.INTERVAL_MIN_MS
        ? config.INTERVAL_MIN_MS + Math.random() * (config.INTERVAL_MAX_MS - config.INTERVAL_MIN_MS)
        : config.INTERVAL_MIN_MS
      
      intervalRef.current = setTimeout(async () => {
        // Re-check post-auth safe mode before executing
        const { isPostAuthSafeMode } = useAppModeStore.getState()
        if (isPostAuthSafeMode()) {
          console.log('[SIM_DISABLED] AI action cycle execution blocked post-auth')
          isRunningRef.current = false
          return
        }
        
        if (isRunningRef.current && cardStackRef.current && !isPausedRef.current) {
          await processAction()
          scheduleNext()
        } else if (isPausedRef.current) {
          // If paused, reschedule check (will wait until resumed)
          scheduleNext()
        }
      }, intervalMs)
    }

    // Fire first action immediately after page loads, then preserve quiet period (4-90s) for subsequent actions
    const isAuthed = useAuthStore.getState().isAuthed
    
    // FIX 2: Prevent duplicate scheduleNext() calls
    // Immediate first action works for both demo mode ON and OFF
    if (!isAuthed && cardStackRef.current) {
      // Fire first action immediately, then start normal schedule
      // Re-check conditions before firing first action
      if (isRunningRef.current && cardStackRef.current && !useAuthStore.getState().isAuthed) {
        // Fire first action immediately, then start normal schedule
        processAction().then(() => {
          // Then start normal schedule (which will wait 4-90s for next action)
          scheduleNext()
        }).catch(() => {
          // If processAction fails, still start the schedule
          scheduleNext()
        })
        // Return early to prevent falling through to scheduleNext() in else branch
        return
      }
      // If inner condition fails, fall through to normal schedule
    }
    
    // Normal schedule (no initial delay) - runs if:
    // 1. User is authenticated, OR
    // 2. cardStackRef is not ready, OR
    // 3. Inner condition failed
    scheduleNext()
  }, [cardStackRef, processAction])

  const stop = useCallback(() => {
    isRunningRef.current = false
    isPausedRef.current = false
    if (intervalRef.current) {
      clearTimeout(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const pause = useCallback(() => {
    isPausedRef.current = true
    // Don't clear interval - let it reschedule when resumed
  }, [])

  const resume = useCallback(() => {
    isPausedRef.current = false
    // The existing scheduleNext loop will automatically pick up when isPausedRef becomes false
    // If no interval is running, we need to restart scheduling
    if (isRunningRef.current && !intervalRef.current && cardStackRef.current) {
      // Restart by calling start's scheduleNext logic inline
      const isAuthed = useAuthStore.getState().isAuthed
      const intensity = getDemoConfig(isAuthed)
      const config = AI_ACTION_CONFIG[intensity]
      const intervalMs = config.INTERVAL_MAX_MS > config.INTERVAL_MIN_MS
        ? config.INTERVAL_MIN_MS + Math.random() * (config.INTERVAL_MAX_MS - config.INTERVAL_MIN_MS)
        : config.INTERVAL_MIN_MS
      
      const scheduleNext = () => {
        const isAuthed = useAuthStore.getState().isAuthed
        const intensity = getDemoConfig(isAuthed)
        const config = AI_ACTION_CONFIG[intensity]
        const nextIntervalMs = config.INTERVAL_MAX_MS > config.INTERVAL_MIN_MS
          ? config.INTERVAL_MIN_MS + Math.random() * (config.INTERVAL_MAX_MS - config.INTERVAL_MIN_MS)
          : config.INTERVAL_MIN_MS
        intervalRef.current = setTimeout(async () => {
          if (isRunningRef.current && cardStackRef.current && !isPausedRef.current) {
            await processAction()
            scheduleNext()
          } else if (isPausedRef.current) {
            scheduleNext()
          }
        }, nextIntervalMs)
      }
      
      intervalRef.current = setTimeout(async () => {
        if (isRunningRef.current && cardStackRef.current && !isPausedRef.current) {
          await processAction()
          scheduleNext()
        } else if (isPausedRef.current) {
          scheduleNext()
        }
      }, intervalMs)
    }
  }, [cardStackRef, processAction])

  // Track previous authState to detect transitions and clear queued timeouts
  const prevAuthStateRef = useRef<string | null>(null)
  
  useEffect(() => {
    // Detect auth state transition to 'authed' and clear all queued timeouts
    const authState = useAuthStore.getState().getAuthState()
    const prevAuthState = prevAuthStateRef.current
    
    if (authState === 'authed' && prevAuthState !== 'authed' && prevAuthState !== null) {
      console.log('[AUTH_TRANSITION] Clearing queued animation timeouts on transition to authed', {
        from: prevAuthState,
        to: authState,
        timestamp: new Date().toISOString(),
      })
      
      // Clear any queued timeouts that may still fire
      stop() // This clears intervalRef.current
      isRunningRef.current = false
      isProcessingRef.current = false
      isPausedRef.current = false
    }
    
    prevAuthStateRef.current = authState
  }, [enabled, stop])
  
  useEffect(() => {
    if (enabled) {
      // Wait for cardStackRef to be ready before starting
      if (!cardStackRef.current) {
        // Use a small polling interval to check when ref becomes available
        const checkRef = setInterval(() => {
          if (cardStackRef.current) {
            clearInterval(checkRef)
            start()
          }
        }, 50) // Check every 50ms
        
        // Timeout after 2 seconds to prevent infinite waiting
        const timeout = setTimeout(() => {
          clearInterval(checkRef)
          if (cardStackRef.current) {
            start()
          }
        }, 2000)
        
        return () => {
          clearInterval(checkRef)
          clearTimeout(timeout)
        }
      } else {
        start()
      }
    } else {
      stop()
    }
    return () => {
      stop()
    }
  }, [enabled, start, stop, cardStackRef])

  return {
    start,
    stop,
    pause,
    resume,
  }
}

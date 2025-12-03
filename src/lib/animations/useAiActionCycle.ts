'use client'

import { useEffect, useRef, useCallback } from 'react'
import type { CardStackHandle } from '@/components/CardStack'
import { useNotificationStore } from '@/store/notifications'
import { usePortfolioStore } from '@/store/portfolio'
import { computePostTrade, type HoldingsZAR } from '@/lib/portfolio/applyTrade'
import { derivePortfolio } from '@/lib/portfolio/calculateMetrics'
import { useAiFabHighlightStore, shouldHighlightAiFab } from '@/state/aiFabHighlight'
import { useBabyCdoChatStore } from '@/state/babyCdoChat'
import { formatBabyCdoIntroFromTradeContext, type TradeContext } from '@/lib/babycdo/formatIntroMessage'
import { useAuthStore } from '@/store/auth'
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
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const isRunningRef = useRef(false)
  const isProcessingRef = useRef(false)
  const pushNotification = useNotificationStore((state) => state.pushNotification)
  const setHoldingsBulk = usePortfolioStore((state) => state.setHoldingsBulk)
  const triggerAiFabHighlight = useAiFabHighlightStore((state) => state.triggerAiFabHighlight)

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  const rnd = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min

  const processAction = useCallback(async () => {
    if (isProcessingRef.current || !cardStackRef.current) return
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
        
        // Generate fragility-focused reasons based on the adjustment
        const isDefensive = delta < 0 // Moving to cash/stable assets
        const reasons = isDefensive
          ? [
              `Fragility increased in ${assetName} markets; preserving purchasing power.`,
              `Short-term volatility detected in ZAR/MZN corridor; raising cash buffer.`,
              `ACD engine detected risk spike; shifting to defensive position.`,
              `Market instability detected; protecting your purchasing power.`,
            ]
          : [
              `Market stabilized; restoring balanced allocation.`,
              `Fragility reduced; redeploying part of cash buffer.`,
              `Risk levels normalized; increasing growth exposure.`,
              `Market conditions improved; rebalancing to target allocation.`,
            ]
        const shortWhyString = reasons[Math.floor(Math.random() * reasons.length)]
        
        // Determine title based on direction
        const title = isDefensive
          ? 'AI reduced market risk'
          : 'AI restored growth exposure'
        
        // Action description focused on protection/restoration
        const actionDescription = isDefensive
          ? `Shifted R${zarAmount.toFixed(2)} to stable assets.`
          : `Redeployed R${zarAmount.toFixed(2)} from cash buffer.`
        
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
          },
          routeOnTap: '/transactions',
        })

        // Trigger FAB highlight for "important" trades (above R150 threshold)
        if (shouldHighlightAiFab(zarAmount)) {
          triggerAiFabHighlight({
            reason: shortWhyString,
            amountZar: zarAmount,
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
  }, [cardStackRef, balanceUpdaters, pushNotification, setHoldingsBulk, triggerAiFabHighlight])

  const start = useCallback(() => {
    if (isRunningRef.current) return
    isRunningRef.current = true

    const scheduleNext = () => {
      // Get current auth state and config
      const isAuthed = useAuthStore.getState().isAuthed
      const intensity = getDemoConfig(isAuthed)
      const config = AI_ACTION_CONFIG[intensity]
      
      // Use random interval for lively mode, fixed for calm mode
      const intervalMs = config.INTERVAL_MAX_MS > config.INTERVAL_MIN_MS
        ? config.INTERVAL_MIN_MS + Math.random() * (config.INTERVAL_MAX_MS - config.INTERVAL_MIN_MS)
        : config.INTERVAL_MIN_MS
      
      intervalRef.current = setTimeout(async () => {
        if (isRunningRef.current && cardStackRef.current) {
          await processAction()
          scheduleNext()
        }
      }, intervalMs)
    }

    // Start schedule earlier: fire first action at ~5s, then preserve quiet period (18-30s) for subsequent actions
    const INITIAL_DELAY_MS = 5000
    const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
    const isAuthed = useAuthStore.getState().isAuthed
    
    if (isDemoMode && !isAuthed && cardStackRef.current) {
      // Wait 5 seconds, then fire first action immediately, then start normal schedule
      setTimeout(async () => {
        // Re-check conditions before firing first action
        if (isRunningRef.current && cardStackRef.current && !useAuthStore.getState().isAuthed) {
          // Fire first action immediately
          await processAction()
          // Then start normal schedule (which will wait 18-30s for next action)
          scheduleNext()
        }
      }, INITIAL_DELAY_MS)
    } else {
      // Normal schedule (no initial delay)
      scheduleNext()
    }
  }, [cardStackRef, processAction])

  const stop = useCallback(() => {
    isRunningRef.current = false
    if (intervalRef.current) {
      clearTimeout(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  useEffect(() => {
    if (enabled) {
      start()
    } else {
      stop()
    }
    return () => {
      stop()
    }
  }, [enabled, start, stop])

  return {
    start,
    stop,
  }
}

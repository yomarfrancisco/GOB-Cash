'use client'

import { createContext, useContext, useState, useCallback, ReactNode, useRef, useEffect } from 'react'
import { getFirebaseAuth } from '@/lib/firebase'
import { updateWalletBalances } from '@/lib/wallets'
import type { WalletMap } from '@/types/wallet'
import { useAuthStore, type AuthStateValue } from '@/store/auth'

export type WalletAlloc = {
  totalCents: number // total funds in cents; funds-available display derives from this
  cashCents: number
  ethCents: number
  zwdCents: number
  earningsCents: number // Earnings card balance (separate from ETH)
  mznCents?: number
  btcCents?: number
}

type AllocState = {
  alloc: WalletAlloc
  // during a sequence, disable ambient flips
  isRebalancing: boolean
}

interface WalletAllocContextType {
  alloc: WalletAlloc
  isRebalancing: boolean
  setRebalancing: (value: boolean) => void
  applyAiAction: (action: { from: 'cash' | 'eth' | 'zwd'; to: 'cash' | 'eth' | 'zwd'; cents: number }) => void
  allocPct: (value: number) => number
  // Getters and setters for direct balance updates
  getCash: () => number
  getEth: () => number
  getZwd: () => number
  getEarnings: () => number
  setCash: (value: number) => void
  setEth: (value: number) => void
  setZwd: (value: number) => void
  setEarnings: (value: number) => void
  // Sync from wallet docs
  syncFromWallets: (wallets: WalletMap) => void
}

const WalletAllocContext = createContext<WalletAllocContextType | undefined>(undefined)

// Zero balances for authenticated users
const ZERO: WalletAlloc = {
  totalCents: 0,
  cashCents: 0,
  ethCents: 0,
  zwdCents: 0,
  earningsCents: 0,
  mznCents: 0,
  btcCents: 0,
}

// Demo balances for pre-auth (marketing)
const DEMO: WalletAlloc = {
  totalCents: 610300, // R6,103.00 (~337 USDT @ 18.1 FX)
  cashCents: 488240, // 80% of total
  ethCents: 18309, // 3% of total
  zwdCents: 42721, // 7% of total
  earningsCents: 61030, // 10% of total (R610.30) - Earnings card never starts at 0
  mznCents: 0,
  btcCents: 0,
}

export function WalletAllocProvider({ children }: { children: ReactNode }) {
  const isAuthed = useAuthStore((state) => state.isAuthed)
  // Initialize based on auth state: ZERO for authed, DEMO for pre-auth
  const [alloc, setAlloc] = useState<WalletAlloc>(() => (isAuthed ? ZERO : DEMO))
  const [isRebalancing, setRebalancing] = useState(false)
  // Track if we're syncing from Firestore to prevent loops
  const isSyncingFromFirestoreRef = useRef(false)
  // Track if we've hydrated from Firestore (prevents demo values from being written)
  const hydratedRef = useRef(false)
  const auth = typeof window !== 'undefined' ? getFirebaseAuth() : null

  // Track previous authState to detect transitions
  const prevAuthStateRef = useRef<AuthStateValue | null>(null)
  
  // Reset to appropriate initial state when auth state changes
  useEffect(() => {
    const authState = useAuthStore.getState().getAuthState()
    const prevAuthState = prevAuthStateRef.current
    
    // Detect transition to 'authed' (from 'loading' or 'unauthed')
    if (authState === 'authed' && prevAuthState !== 'authed' && prevAuthState !== null) {
      console.log('[AUTH_TRANSITION] Transitioning to authed - hard resetting demo state', {
        from: prevAuthState,
        to: authState,
        timestamp: new Date().toISOString(),
      })
      
      // HARD RESET: Reset all demo balances to 0
      setAlloc(ZERO)
      hydratedRef.current = false
      
      // Ensure wallet store is reset (will be set by FirebaseAuthListener, but ensure it's zero)
      // Import dynamically to avoid circular dependency
      import('@/store/wallets').then(({ useWalletStore }) => {
        const walletStore = useWalletStore.getState()
        // Clear wallets to empty object (will be populated from Firestore)
        walletStore.setWallets({} as WalletMap)
        walletStore.setDemoMode(false)
        walletStore.setWalletsStatus('loading')
      })
    } else if (isAuthed) {
      // When signing in (but not a transition we just handled), reset to zero
      setAlloc(ZERO)
      hydratedRef.current = false
    } else {
      // When signing out, reset to demo
      setAlloc(DEMO)
      hydratedRef.current = false
    }
    
    // Update previous authState
    prevAuthStateRef.current = authState
  }, [isAuthed])

  const applyAiAction = useCallback(
    (action: { from: 'cash' | 'eth' | 'zwd'; to: 'cash' | 'eth' | 'zwd'; cents: number }) => {
      setAlloc((prev) => {
        const fromKey = `${action.from}Cents` as keyof WalletAlloc
        const toKey = `${action.to}Cents` as keyof WalletAlloc

        const fromValue = prev[fromKey] as number
        const toValue = prev[toKey] as number

        // Clamp: from >= 0, to <= total
        const transferCents = Math.min(action.cents, fromValue)
        const newFromValue = Math.max(0, fromValue - transferCents)
        const newToValue = Math.min(prev.totalCents, toValue + transferCents)

        const newAlloc = {
          ...prev,
          [fromKey]: newFromValue,
          [toKey]: newToValue,
          // totalCents stays constant
        }

        // Persist to wallets (non-blocking) - only if authenticated, hydrated, and not syncing
        if (
          typeof window !== 'undefined' &&
          auth?.currentUser &&
          hydratedRef.current &&
          !isSyncingFromFirestoreRef.current
        ) {
          const userId = auth.currentUser.uid
          const fxRate = 18.1 // ZAR per USDT

          const updates: Array<Promise<void>> = []
          if (action.from === 'cash' || action.to === 'cash') {
            updates.push(
              updateWalletBalances(userId, 'cashZAR', { fiatBalance: newAlloc.cashCents / 100 }).catch((err) =>
                console.error('[Wallet] Failed to persist cash wallet', err)
              )
            )
          }
          if (action.from === 'eth' || action.to === 'eth') {
            const fiat = newAlloc.ethCents / 100
            updates.push(
              updateWalletBalances(userId, 'eth', {
                fiatBalance: fiat,
                usdtBalance: fiat / fxRate,
              }).catch((err) => console.error('[Wallet] Failed to persist eth wallet', err))
            )
          }
          if (action.from === 'zwd' || action.to === 'zwd') {
            updates.push(
              updateWalletBalances(userId, 'cashZWD', { fiatBalance: newAlloc.zwdCents / 100 }).catch((err) =>
                console.error('[Wallet] Failed to persist zwd wallet', err)
              )
            )
          }
          Promise.all(updates).catch(() => {
            // logged individually
          })
        }

        return newAlloc
      })
    },
    [auth]
  )

  const allocPct = useCallback(
    (value: number) => {
      return Math.round((10000 * value) / alloc.totalCents) / 100 // 2-dp % for display
    },
    [alloc.totalCents]
  )

  const getCash = useCallback(() => alloc.cashCents / 100, [alloc.cashCents])
  const getEth = useCallback(() => alloc.ethCents / 100, [alloc.ethCents])
  const getZwd = useCallback(() => alloc.zwdCents / 100, [alloc.zwdCents])
  const getEarnings = useCallback(() => alloc.earningsCents / 100, [alloc.earningsCents])

  const setCash = useCallback(
    (value: number) => {
      // INSTRUMENTATION: Track all balance mutations
      const stack = new Error().stack
      const caller = stack?.split('\n')[2]?.trim() || 'unknown'
      const authState = useAuthStore.getState().getAuthState()
      const balanceMode = useAuthStore.getState().getBalanceMode()
      const isAuthed = useAuthStore.getState().isAuthed
      const authReady = useAuthStore.getState().authReady
      
      console.log('[BALANCE_INSTRUMENTATION] setCash called', {
        value,
        caller,
        authState,
        balanceMode,
        isAuthed,
        authReady,
        hydrated: hydratedRef.current,
        syncing: isSyncingFromFirestoreRef.current,
        timestamp: new Date().toISOString(),
        stack: stack?.split('\n').slice(0, 5).join('\n'),
      })
      
      // CRITICAL GATE: Demo balance mutations must early-return unless authState === 'unauthed'
      if (authState !== 'unauthed') {
        console.warn('[BALANCE_INSTRUMENTATION] ⚠️ BLOCKED: setCash called but authState !== "unauthed"', {
          value,
          caller,
          authState,
          balanceMode,
          stack: stack?.split('\n').slice(0, 8).join('\n'),
        })
        return // Early return - do not mutate balance
      }
      
      // WARNING: Non-zero balance mutation for authenticated/loading user (should not reach here due to gate above)
      if (value > 0 && (isAuthed || !authReady)) {
        console.warn('[BALANCE_INSTRUMENTATION] ⚠️ LEAK DETECTED: setCash with non-zero value for authenticated/loading user', {
          value,
          caller,
          authState,
          stack: stack?.split('\n').slice(0, 8).join('\n'),
        })
      }
      
      setAlloc((prev) => {
        const newCashCents = Math.round(value * 100)
        const newAlloc = { ...prev, cashCents: newCashCents }
        
        // Persist to wallet doc (non-blocking) - only if authenticated, hydrated, and not syncing
        if (
          typeof window !== 'undefined' &&
          auth?.currentUser &&
          hydratedRef.current &&
          !isSyncingFromFirestoreRef.current
        ) {
          updateWalletBalances(auth.currentUser.uid, 'cashZAR', { fiatBalance: value }).catch((err) => {
            console.error('[Wallet] Failed to persist ZAR balance to Firestore:', err)
          })
        }
        
        return newAlloc
      })
    },
    [auth]
  )

  const setEth = useCallback(
    (value: number) => {
      // INSTRUMENTATION: Track all balance mutations
      const stack = new Error().stack
      const caller = stack?.split('\n')[2]?.trim() || 'unknown'
      const authState = useAuthStore.getState().getAuthState()
      const balanceMode = useAuthStore.getState().getBalanceMode()
      const isAuthed = useAuthStore.getState().isAuthed
      const authReady = useAuthStore.getState().authReady
      
      console.log('[BALANCE_INSTRUMENTATION] setEth called', {
        value,
        caller,
        authState,
        balanceMode,
        isAuthed,
        authReady,
        hydrated: hydratedRef.current,
        syncing: isSyncingFromFirestoreRef.current,
        timestamp: new Date().toISOString(),
        stack: stack?.split('\n').slice(0, 5).join('\n'),
      })
      
      // CRITICAL GATE: Demo balance mutations must early-return unless authState === 'unauthed'
      if (authState !== 'unauthed') {
        console.warn('[BALANCE_INSTRUMENTATION] ⚠️ BLOCKED: setEth called but authState !== "unauthed"', {
          value,
          caller,
          authState,
          balanceMode,
          stack: stack?.split('\n').slice(0, 8).join('\n'),
        })
        return // Early return - do not mutate balance
      }
      
      // WARNING: Non-zero balance mutation for authenticated/loading user (should not reach here due to gate above)
      if (value > 0 && (isAuthed || !authReady)) {
        console.warn('[BALANCE_INSTRUMENTATION] ⚠️ LEAK DETECTED: setEth with non-zero value for authenticated/loading user', {
          value,
          caller,
          authState,
          stack: stack?.split('\n').slice(0, 8).join('\n'),
        })
      }
      
      setAlloc((prev) => {
        const newEthCents = Math.round(value * 100)
        const newAlloc = { ...prev, ethCents: newEthCents }
        
        // Persist to wallet doc (non-blocking) - only if authenticated, hydrated, and not syncing
        if (
          typeof window !== 'undefined' &&
          auth?.currentUser &&
          hydratedRef.current &&
          !isSyncingFromFirestoreRef.current
        ) {
          const fxRate = 18.1 // ZAR per USDT
          const usdtValue = value / fxRate
          updateWalletBalances(auth.currentUser.uid, 'eth', {
            fiatBalance: value,
            usdtBalance: usdtValue,
          }).catch((err) => {
            console.error('[Wallet] Failed to persist ETH/USDT balance to Firestore:', err)
          })
        }
        
        return newAlloc
      })
    },
    [auth]
  )

  const setZwd = useCallback(
    (value: number) => {
      // INSTRUMENTATION: Track all balance mutations
      const stack = new Error().stack
      const caller = stack?.split('\n')[2]?.trim() || 'unknown'
      const authState = useAuthStore.getState().getAuthState()
      const balanceMode = useAuthStore.getState().getBalanceMode()
      const isAuthed = useAuthStore.getState().isAuthed
      const authReady = useAuthStore.getState().authReady
      
      console.log('[BALANCE_INSTRUMENTATION] setZwd called', {
        value,
        caller,
        authState,
        balanceMode,
        isAuthed,
        authReady,
        hydrated: hydratedRef.current,
        syncing: isSyncingFromFirestoreRef.current,
        timestamp: new Date().toISOString(),
        stack: stack?.split('\n').slice(0, 5).join('\n'),
      })
      
      // CRITICAL GATE: Demo balance mutations must early-return unless authState === 'unauthed'
      if (authState !== 'unauthed') {
        console.warn('[BALANCE_INSTRUMENTATION] ⚠️ BLOCKED: setZwd called but authState !== "unauthed"', {
          value,
          caller,
          authState,
          balanceMode,
          stack: stack?.split('\n').slice(0, 8).join('\n'),
        })
        return // Early return - do not mutate balance
      }
      
      // WARNING: Non-zero balance mutation for authenticated/loading user (should not reach here due to gate above)
      if (value > 0 && (isAuthed || !authReady)) {
        console.warn('[BALANCE_INSTRUMENTATION] ⚠️ LEAK DETECTED: setZwd with non-zero value for authenticated/loading user', {
          value,
          caller,
          authState,
          stack: stack?.split('\n').slice(0, 8).join('\n'),
        })
      }
      
      setAlloc((prev) => {
        const newZwdCents = Math.round(value * 100)
        const newAlloc = { ...prev, zwdCents: newZwdCents }
        
        // Persist to wallet doc (non-blocking) - only if authenticated, hydrated, and not syncing
        if (
          typeof window !== 'undefined' &&
          auth?.currentUser &&
          hydratedRef.current &&
          !isSyncingFromFirestoreRef.current
        ) {
          updateWalletBalances(auth.currentUser.uid, 'cashZWD', { fiatBalance: value }).catch((err) => {
            console.error('[Wallet] Failed to persist ZWD balance to Firestore:', err)
          })
        }
        
        return newAlloc
      })
    },
    [auth]
  )

  const setEarnings = useCallback(
    (value: number) => {
      setAlloc((prev) => {
        const newEarningsCents = Math.round(value * 100)
        // Earnings never writes to Firestore (no updateWalletBalances call)
        // This is intentional - earnings should only be set by real transaction logic
        return { ...prev, earningsCents: newEarningsCents }
      })
    },
    []
  )

  // Sync WalletAlloc from wallet docs (source of truth)
  // This is the hydration gate: after first sync, hydratedRef becomes true and allows writes
  const syncFromWallets = useCallback((wallets: WalletMap) => {
    isSyncingFromFirestoreRef.current = true
    try {
      const fxRate = 18.1 // ZAR per USDT
      const getFiat = (id: string) => (wallets as any)[id]?.fiatBalance ?? 0
      const getUsdt = (id: string) => (wallets as any)[id]?.usdtBalance ?? 0

      const cashZAR = getFiat('cashZAR')
      const cashZWD = getFiat('cashZWD')
      const cashMZN = getFiat('cashMZN')
      const ethFiat = getFiat('eth')
      const btcFiat = getFiat('btc')
      const earningsFiat = getFiat('earnings')

      const newAlloc: WalletAlloc = {
        cashCents: Math.round(cashZAR * 100),
        zwdCents: Math.round(cashZWD * 100),
        mznCents: Math.round(cashMZN * 100),
        ethCents: Math.round(ethFiat * 100),
        btcCents: Math.round(btcFiat * 100),
        earningsCents: Math.round(earningsFiat * 100),
        totalCents: Math.round(
          (cashZAR + cashZWD + cashMZN + ethFiat + btcFiat + earningsFiat) * 100
        ),
      }
      setAlloc(newAlloc)
      
      // Mark as hydrated after first successful sync (only for authenticated users)
      if (auth?.currentUser) {
        hydratedRef.current = true
      }
      
      if (process.env.NODE_ENV !== 'production') {
        console.log('[Wallet] Synced WalletAlloc from wallets:', wallets, 'hydrated:', hydratedRef.current)
      }
    } finally {
      setTimeout(() => {
        isSyncingFromFirestoreRef.current = false
      }, 100)
    }
  }, [auth])

  return (
    <WalletAllocContext.Provider
      value={{
        alloc,
        isRebalancing,
        setRebalancing,
        applyAiAction,
        allocPct,
        getCash,
        getEth,
        getZwd,
        getEarnings,
        setCash,
        setEth,
        setZwd,
        setEarnings,
        syncFromWallets,
      }}
    >
      {children}
    </WalletAllocContext.Provider>
  )
}

export function useWalletAlloc() {
  const context = useContext(WalletAllocContext)
  if (context === undefined) {
    throw new Error('useWalletAlloc must be used within WalletAllocProvider')
  }
  return context
}


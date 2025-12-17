'use client'

import { create } from 'zustand'
import type { WalletDoc, WalletId, WalletMap } from '@/types/wallet'
import { useAuthStore } from '@/store/auth'

type WalletsStatus = 'loading' | 'ready'

type WalletState = {
  wallets: Partial<WalletMap>
  loading: boolean
  demoMode: boolean
  walletsStatus: WalletsStatus // Track if wallets are loading or ready from Firestore
  walletsHydrated: boolean // Track if Firestore wallets have been hydrated for authed user
  setWallets: (wallets: WalletMap) => void
  upsertWallet: (wallet: WalletDoc) => void
  setLoading: (loading: boolean) => void
  setDemoMode: (demo: boolean) => void
  setWalletsStatus: (status: WalletsStatus) => void
  setWalletsHydrated: (hydrated: boolean) => void
  clear: () => void
}

// Demo defaults roughly matching prior mock data (ZAR-heavy)
const demoWallets: Partial<WalletMap> = {
  cashZAR: {
    walletId: 'cashZAR',
    kind: 'cash',
    displayCurrency: 'ZAR',
    fiatBalance: 4882.4,
    usdtBalance: 0,
    apy: 9.38,
  },
  cashMZN: {
    walletId: 'cashMZN',
    kind: 'cash',
    displayCurrency: 'MZN',
    fiatBalance: 0,
    usdtBalance: 0,
    apy: 9.38,
  },
  cashZWD: {
    walletId: 'cashZWD',
    kind: 'cash',
    displayCurrency: 'ZWD',
    fiatBalance: 427.21,
    usdtBalance: 0,
    apy: 9.38,
  },
  eth: {
    walletId: 'eth',
    kind: 'crypto',
    displayCurrency: 'ZAR',
    fiatBalance: 146.98,
    usdtBalance: 8.12,
    apy: 0,
  },
  btc: {
    walletId: 'btc',
    kind: 'crypto',
    displayCurrency: 'ZAR',
    fiatBalance: 0,
    usdtBalance: 0,
    apy: 0,
  },
  earnings: {
    walletId: 'earnings',
    kind: 'earnings',
    displayCurrency: 'ZAR',
    fiatBalance: 610.3,
    usdtBalance: 0,
    apy: 9.38,
  },
}

export const useWalletStore = create<WalletState>((set) => ({
  wallets: demoWallets,
  loading: false,
  demoMode: true,
  walletsStatus: 'loading', // Start in loading state
  walletsHydrated: false, // Start as not hydrated
  setWallets: (wallets) => {
    // INSTRUMENTATION: Track wallet store mutations
    const stack = new Error().stack
    const caller = stack?.split('\n')[2]?.trim() || 'unknown'
    
    // Check auth state and balance mode
    const authState = useAuthStore.getState().getAuthState()
    const balanceMode = useAuthStore.getState().getBalanceMode()
    const isAuthed = useAuthStore.getState().isAuthed
    const authReady = useAuthStore.getState().authReady
    
    // Check if any wallet has non-zero balance
    const hasNonZeroBalance = Object.values(wallets).some((w: any) => 
      (w?.fiatBalance && w.fiatBalance > 0) || (w?.usdtBalance && w.usdtBalance > 0)
    )
    
    console.log('[BALANCE_INSTRUMENTATION] setWallets called', {
      walletIds: Object.keys(wallets),
      hasNonZeroBalance,
      caller,
      authState,
      balanceMode,
      isAuthed,
      authReady,
      timestamp: new Date().toISOString(),
      stack: stack?.split('\n').slice(0, 5).join('\n'),
    })
    
    // GATE: Only block demo balances, not Firestore balances
    // Firestore wallets have proper structure: walletId, kind, displayCurrency, etc.
    // Demo wallets are just partial objects with balances
    const hasFirestoreStructure = Object.values(wallets).some((w: any) => 
      w?.walletId && w?.kind && w?.displayCurrency
    )
    
    // Rule A: If wallets have Firestore structure → DO NOT zero (Firestore is source of truth)
    // Rule B: Only zero pre-auth demo state or unauthenticated mock wallets
    if (authState === 'authed' && hasFirestoreStructure) {
      // This is Firestore data - always allow through, even if non-zero
      // Firestore is the authoritative source
      // Mark as hydrated on first successful snapshot for authed user
      const currentState = useWalletStore.getState()
      const isFirstHydration = !currentState.walletsHydrated && authState === 'authed'
      
      set({ wallets, demoMode: false, walletsStatus: 'ready', walletsHydrated: true })
      
      if (isFirstHydration) {
        console.log('[HYDRATION] ✅ First Firestore wallets snapshot received -> walletsHydrated=true', {
          walletIds: Object.keys(wallets),
          timestamp: new Date().toISOString(),
        })
      }
      return
    }
    
    // Only zero out balances if:
    // 1. User is NOT authenticated (pre-auth demo state) OR
    // 2. Wallets don't have Firestore structure (demo/initial state)
    if (authState !== 'authed' || !hasFirestoreStructure) {
      if (hasNonZeroBalance) {
        // This is demo balance - block it for authenticated users
        const zeroedWallets: WalletMap = {} as WalletMap
        Object.keys(wallets).forEach((key) => {
          const wallet = (wallets as any)[key]
          zeroedWallets[key as keyof WalletMap] = {
            ...wallet,
            fiatBalance: 0,
            usdtBalance: 0,
          }
        })
        
        console.warn('[BALANCE_INSTRUMENTATION] ⚠️ BLOCKED: Demo balance leak - zeroing out', {
          authState,
          hasFirestoreStructure,
          caller,
        })
        
        set({ wallets: zeroedWallets, demoMode: false, walletsStatus: 'ready' })
        return
      }
    }
    
    set({ wallets, demoMode: false, walletsStatus: 'ready' })
  },
  upsertWallet: (wallet) =>
    set((state) => ({
      wallets: {
        ...state.wallets,
        [wallet.walletId]: wallet,
      },
      demoMode: false,
      walletsStatus: 'ready', // Mark as ready when we receive wallet updates
    })),
  setLoading: (loading) => set({ loading }),
  setDemoMode: (demo) => set({ demoMode: demo }),
  setWalletsStatus: (status) => set({ walletsStatus: status }),
  setWalletsHydrated: (hydrated) => set({ walletsHydrated: hydrated }),
  clear: () => set({ wallets: demoWallets, demoMode: true, walletsStatus: 'loading', walletsHydrated: false }),
}))



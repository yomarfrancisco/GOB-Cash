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
  setWallets: (wallets: WalletMap) => void
  upsertWallet: (wallet: WalletDoc) => void
  setLoading: (loading: boolean) => void
  setDemoMode: (demo: boolean) => void
  setWalletsStatus: (status: WalletsStatus) => void
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
    
    // GATE: If authState is 'authed' or 'loading', ensure all balances are zero
    // This prevents demo balances from being set during auth resolution
    if (authState !== 'unauthed') {
      // Force all balances to zero for authenticated/loading users
      const zeroedWallets: WalletMap = {} as WalletMap
      Object.keys(wallets).forEach((key) => {
        const wallet = (wallets as any)[key]
        zeroedWallets[key as keyof WalletMap] = {
          ...wallet,
          fiatBalance: 0,
          usdtBalance: 0,
        }
      })
      
      if (hasNonZeroBalance) {
        console.warn('[BALANCE_INSTRUMENTATION] ⚠️ BLOCKED: setWallets with non-zero balances for authenticated/loading user - zeroing out', {
          originalWallets: wallets,
          zeroedWallets,
          caller,
          authState,
          balanceMode,
          stack: stack?.split('\n').slice(0, 8).join('\n'),
        })
      }
      
      set({ wallets: zeroedWallets, demoMode: false, walletsStatus: 'ready' })
      return
    }
    
    // WARNING: Non-zero balance mutation for authenticated/loading user (should not reach here due to gate above)
    if (hasNonZeroBalance && (isAuthed || !authReady)) {
      console.warn('[BALANCE_INSTRUMENTATION] ⚠️ LEAK DETECTED: setWallets with non-zero balances for authenticated/loading user', {
        wallets,
        caller,
        authState,
        stack: stack?.split('\n').slice(0, 8).join('\n'),
      })
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
  clear: () => set({ wallets: demoWallets, demoMode: true, walletsStatus: 'loading' }),
}))



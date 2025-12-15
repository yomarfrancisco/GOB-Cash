'use client'

import { create } from 'zustand'
import type { WalletDoc, WalletId, WalletMap } from '@/types/wallet'

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
  setWallets: (wallets) => set({ wallets, demoMode: false, walletsStatus: 'ready' }),
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



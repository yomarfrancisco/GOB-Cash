export type WalletMode = 'autonomous' | 'manual'

const KEY = 'walletMode'

export function getWalletMode(): WalletMode {
  if (typeof window === 'undefined') return 'autonomous'

  const v = localStorage.getItem(KEY)
  return (v === 'manual' || v === 'autonomous') ? v : 'autonomous'
}

export function setWalletMode(mode: WalletMode) {
  try {
    localStorage.setItem(KEY, mode)
  } catch {
    // Ignore localStorage errors (e.g., private browsing)
  }
}


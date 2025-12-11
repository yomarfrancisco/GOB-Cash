/** Canonical wallet types for Firestore wallet subcollection */

export type WalletKind = 'cash' | 'crypto' | 'earnings'

// Extendable list of wallet IDs; new wallets can be added later without breaking existing logic.
export type WalletId =
  | 'cashZAR'
  | 'cashMZN'
  | 'cashZWD'
  | 'btc'
  | 'eth'
  | 'earnings'

export interface WalletDoc {
  walletId: WalletId
  kind: WalletKind
  displayCurrency: string // e.g., 'ZAR', 'MZN', 'ZWD', 'BTC', 'ETH'
  fiatBalance: number
  usdtBalance: number
  apy?: number
  riskScore?: number
  timeLeftDays?: number
  createdAt?: any
  updatedAt?: any
}

export type WalletMap = Record<WalletId, WalletDoc>


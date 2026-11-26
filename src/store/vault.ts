/**
 * Vault position — client cache of users/{uid}/vault/position (+ pending supply).
 * Withdrawable = supplied − committed (no daily redeem cap in product copy).
 */
import { create } from 'zustand'

export type VaultDeliveryLeg = {
  id: string
  atMs: number
  amountZar: number
  status: 'landed' | 'booked'
  earnedUsd: number
}

export type VaultLastSupply = {
  amountUsdc: number
  sender: string
  signature: string
  atMs: number
}

export type VaultPendingSupply = {
  id: string
  reference: string
  createdAtMs: number
}

export type VaultPosition = {
  /** USDC supplied by this user (0 = empty). */
  suppliedUsdc: number
  /** Trailing realized APY % (30d or shorter window). Null = hide numeric rate. */
  trailingApyPct: number | null
  /**
   * USDC free to leave now (not funding an open delivery).
   * Product rule: anything not committed is withdrawable.
   */
  withdrawableNowUsd: number
  /** USDC locked in open / booked corridor funding. */
  committedUsdc: number
  /** ZAR this position has funded / earned to operators (desk back card). */
  zarFunded: number
  zarEarned: number
  earnedUsdToday: number
  deliveriesToday: number
  deliveriesZarToday: number
  suppliedAtMs: number | null
  backAtMs: number | null
  legs: VaultDeliveryLeg[]
  expectedEarnedUsd: number
  /** Linked Solana wallet (last confirmed supply sender) — withdrawals. */
  linkedSolanaWallet: string | null
  lastSupply: VaultLastSupply | null
  pendingSupply: VaultPendingSupply | null
}

const EMPTY: VaultPosition = {
  suppliedUsdc: 0,
  trailingApyPct: 8.4,
  withdrawableNowUsd: 0,
  committedUsdc: 0,
  zarFunded: 0,
  zarEarned: 0,
  earnedUsdToday: 0,
  deliveriesToday: 0,
  deliveriesZarToday: 0,
  suppliedAtMs: null,
  backAtMs: null,
  legs: [],
  expectedEarnedUsd: 0,
  linkedSolanaWallet: null,
  lastSupply: null,
  pendingSupply: null,
}

/** Demo after-supply snapshot — all free float until desk commits deliveries. */
const DEMO_SUPPLIED: VaultPosition = {
  suppliedUsdc: 5000,
  trailingApyPct: 8.4,
  withdrawableNowUsd: 5000,
  committedUsdc: 0,
  zarFunded: 0,
  zarEarned: 0,
  earnedUsdToday: 0,
  deliveriesToday: 0,
  deliveriesZarToday: 0,
  suppliedAtMs: Date.now(),
  backAtMs: null,
  legs: [],
  expectedEarnedUsd: 0,
  linkedSolanaWallet: null,
  lastSupply: {
    amountUsdc: 5000,
    sender: '7xKXxxxxxxxxxxxxxxxxxxxxxxxxxxxx9fQa',
    signature: '3f2axxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    atMs: Date.now(),
  },
  pendingSupply: null,
}

type VaultState = {
  position: VaultPosition
  setPosition: (next: Partial<VaultPosition>) => void
  replacePosition: (next: VaultPosition) => void
  /** UI-only fallback when backend credit is not yet available. */
  applyDemoSupply: (usdc?: number) => void
  setPendingSupply: (pending: VaultPendingSupply | null) => void
  clearSupply: () => void
}

export function vaultHasSupply(position: VaultPosition): boolean {
  return Number(position.suppliedUsdc) > 0.005
}

/** Share withdrawable now = free float / supplied (no daily cap). */
export function vaultWithdrawableShare(position: VaultPosition): number {
  const supplied = Number(position.suppliedUsdc) || 0
  if (!(supplied > 0.005)) return 0
  const free = Math.max(0, Number(position.withdrawableNowUsd) || 0)
  return Math.max(0, Math.min(1, free / supplied))
}

export function vaultCommittedUsdc(position: VaultPosition): number {
  const supplied = Math.max(0, Number(position.suppliedUsdc) || 0)
  const free = Math.max(0, Number(position.withdrawableNowUsd) || 0)
  const explicit = Math.max(0, Number(position.committedUsdc) || 0)
  if (explicit > 0.005) return Math.min(supplied, explicit)
  return Math.max(0, supplied - free)
}

export const useVaultStore = create<VaultState>((set) => ({
  position: EMPTY,
  setPosition: (next) =>
    set((s) => ({
      position: { ...s.position, ...next },
    })),
  replacePosition: (next) => set({ position: next }),
  applyDemoSupply: (usdc = 5000) =>
    set({
      position: {
        ...DEMO_SUPPLIED,
        suppliedUsdc: usdc,
        withdrawableNowUsd: usdc,
        committedUsdc: 0,
        lastSupply: {
          amountUsdc: usdc,
          sender: DEMO_SUPPLIED.lastSupply!.sender,
          signature: DEMO_SUPPLIED.lastSupply!.signature,
          atMs: Date.now(),
        },
        pendingSupply: null,
        suppliedAtMs: Date.now(),
      },
    }),
  setPendingSupply: (pending) =>
    set((s) => ({
      position: { ...s.position, pendingSupply: pending },
    })),
  clearSupply: () => set({ position: { ...EMPTY } }),
}))

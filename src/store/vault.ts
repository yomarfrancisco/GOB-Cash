/**
 * Vault v1 client position — placeholder ledger until live vault wires in.
 * [x] figures in Earn UI read from here; never invent a promised APY.
 */
import { create } from 'zustand'

export type VaultDeliveryLeg = {
  id: string
  atMs: number
  amountZar: number
  status: 'landed' | 'booked'
  earnedUsd: number
}

export type VaultPosition = {
  /** USDC supplied by this user (0 = empty / static home card). */
  suppliedUsdc: number
  /** Trailing realized APY % (30d or shorter window). Null = hide numeric rate. */
  trailingApyPct: number | null
  /** USD that can leave today (after daily redemption + funding lock). */
  withdrawableNowUsd: number
  /** Daily redemption ceiling in USD. */
  dailyRedeemLimitUsd: number
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
}

const EMPTY: VaultPosition = {
  suppliedUsdc: 0,
  trailingApyPct: 8.4,
  withdrawableNowUsd: 0,
  dailyRedeemLimitUsd: 2500,
  zarFunded: 0,
  zarEarned: 0,
  earnedUsdToday: 0,
  deliveriesToday: 0,
  deliveriesZarToday: 0,
  suppliedAtMs: null,
  backAtMs: null,
  legs: [],
  expectedEarnedUsd: 0,
}

/** Demo after-supply snapshot matching Part 17 copy (placeholders where marked). */
const DEMO_SUPPLIED: VaultPosition = {
  suppliedUsdc: 5000,
  trailingApyPct: 8.4,
  withdrawableNowUsd: 1500,
  dailyRedeemLimitUsd: 2500,
  zarFunded: 412000,
  zarEarned: 412000,
  earnedUsdToday: 12.4,
  deliveriesToday: 3,
  deliveriesZarToday: 412000,
  suppliedAtMs: Date.parse('2026-11-24T07:12:00+02:00'),
  backAtMs: Date.parse('2026-11-25T09:00:00+02:00'),
  legs: [
    {
      id: '1',
      atMs: Date.parse('2026-11-24T09:40:00+02:00'),
      amountZar: 120000,
      status: 'landed',
      earnedUsd: 4.1,
    },
    {
      id: '2',
      atMs: Date.parse('2026-11-24T14:10:00+02:00'),
      amountZar: 90000,
      status: 'landed',
      earnedUsd: 3.05,
    },
    {
      id: '3',
      atMs: Date.parse('2026-11-25T09:00:00+02:00'),
      amountZar: 202000,
      status: 'booked',
      earnedUsd: 5.25,
    },
  ],
  expectedEarnedUsd: 18.6,
}

type VaultState = {
  position: VaultPosition
  setPosition: (next: Partial<VaultPosition>) => void
  /** UI-only: treat as supplied with Part 17 demo figures. */
  applyDemoSupply: (usdc?: number) => void
  clearSupply: () => void
}

export function vaultHasSupply(position: VaultPosition): boolean {
  return Number(position.suppliedUsdc) > 0.005
}

/** Share withdrawable now = min(daily limit, free float) / supplied. */
export function vaultWithdrawableShare(position: VaultPosition): number {
  const supplied = Number(position.suppliedUsdc) || 0
  if (!(supplied > 0.005)) return 0
  const free = Math.max(0, Number(position.withdrawableNowUsd) || 0)
  const capped = Math.min(Number(position.dailyRedeemLimitUsd) || 0, free)
  return Math.max(0, Math.min(1, capped / supplied))
}

export const useVaultStore = create<VaultState>((set) => ({
  position: EMPTY,
  setPosition: (next) =>
    set((s) => ({
      position: { ...s.position, ...next },
    })),
  applyDemoSupply: (usdc = 5000) =>
    set({
      position: {
        ...DEMO_SUPPLIED,
        suppliedUsdc: usdc,
      },
    }),
  clearSupply: () => set({ position: { ...EMPTY } }),
}))

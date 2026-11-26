/**
 * Vault / delivery-note position — client cache of users/{uid}/vault/position.
 * Part 19: 24h note with locked step-down rates (see deliveryNote.ts).
 */
import { create } from 'zustand'
import { liveNoteRatePct } from '@/lib/vault/deliveryNote'

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
  /** USDC supplied into today's note (0 = empty). */
  suppliedUsdc: number
  /** @deprecated Part 19 — use lockedRatePct / live note rate. Kept for older docs. */
  trailingApyPct: number | null
  /** Rate locked when deposit landed (%). */
  lockedRatePct: number | null
  /** USDC currently funding deliveries. */
  usedUsdc: number
  /**
   * USDC free / unused (comes back at cycle return with no return).
   */
  withdrawableNowUsd: number
  /** Alias for used float when ledger only has committed. */
  committedUsdc: number
  /** ZAR delivered with this USDC so far. */
  zarFunded: number
  zarEarned: number
  earnedUsdToday: number
  deliveriesToday: number
  deliveriesZarToday: number
  suppliedAtMs: number | null
  backAtMs: number | null
  settledAtMs: number | null
  returnedUsdc: number | null
  notePhase: 'open' | 'funded' | 'settled' | 'closed' | 'late' | null
  noteFull: boolean
  legs: VaultDeliveryLeg[]
  expectedEarnedUsd: number
  linkedSolanaWallet: string | null
  lastSupply: VaultLastSupply | null
  pendingSupply: VaultPendingSupply | null
}

const EMPTY: VaultPosition = {
  suppliedUsdc: 0,
  trailingApyPct: null,
  lockedRatePct: null,
  usedUsdc: 0,
  withdrawableNowUsd: 0,
  committedUsdc: 0,
  zarFunded: 0,
  zarEarned: 0,
  earnedUsdToday: 0,
  deliveriesToday: 0,
  deliveriesZarToday: 0,
  suppliedAtMs: null,
  backAtMs: null,
  settledAtMs: null,
  returnedUsdc: null,
  notePhase: null,
  noteFull: false,
  legs: [],
  expectedEarnedUsd: 0,
  linkedSolanaWallet: null,
  lastSupply: null,
  pendingSupply: null,
}

/** Part 19 funded mock — placeholders from the canvas. */
const DEMO_FUNDED: VaultPosition = {
  suppliedUsdc: 5000,
  trailingApyPct: null,
  lockedRatePct: 6.25,
  usedUsdc: 3100,
  withdrawableNowUsd: 1900,
  committedUsdc: 3100,
  zarFunded: 56482,
  zarEarned: 56482,
  earnedUsdToday: 0,
  deliveriesToday: 0,
  deliveriesZarToday: 56482,
  suppliedAtMs: Date.now(),
  backAtMs: null,
  settledAtMs: null,
  returnedUsdc: null,
  notePhase: 'funded',
  noteFull: false,
  legs: [],
  expectedEarnedUsd: 312,
  linkedSolanaWallet: '7xKXxxxxxxxxxxxxxxxxxxxxxxxxxxxx9fQa',
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
  /** UI-only: Part 19 funded snapshot (or custom USDC with live lock). */
  applyDemoSupply: (usdc?: number) => void
  setPendingSupply: (pending: VaultPendingSupply | null) => void
  clearSupply: () => void
}

export function vaultHasSupply(position: VaultPosition): boolean {
  return Number(position.suppliedUsdc) > 0.005
}

/** Share in use = used / supplied. */
export function vaultWithdrawableShare(position: VaultPosition): number {
  const supplied = Number(position.suppliedUsdc) || 0
  if (!(supplied > 0.005)) return 0
  const used = Math.max(
    0,
    Number(position.usedUsdc) || Number(position.committedUsdc) || 0
  )
  return Math.max(0, Math.min(1, used / supplied))
}

export function vaultCommittedUsdc(position: VaultPosition): number {
  const used = Number(position.usedUsdc)
  if (Number.isFinite(used) && used >= 0) return used
  return Math.max(0, Number(position.committedUsdc) || 0)
}

export const useVaultStore = create<VaultState>((set) => ({
  position: EMPTY,
  setPosition: (next) =>
    set((s) => ({
      position: { ...s.position, ...next },
    })),
  replacePosition: (next) => set({ position: next }),
  applyDemoSupply: (usdc = 5000) => {
    const at = Date.now()
    const rate = liveNoteRatePct(at)
    set((s) => {
      const prev = s.position
      const prevSupplied = Number(prev.suppliedUsdc) || 0
      // Second deposit: blend locked rates; keep in-use / ZAR figures.
      if (prevSupplied > 0.005) {
        const nextSupplied = Math.round((prevSupplied + usdc) * 1e6) / 1e6
        const prevLocked =
          typeof prev.lockedRatePct === 'number' && Number.isFinite(prev.lockedRatePct)
            ? prev.lockedRatePct
            : rate
        const blended =
          Math.round(((prevLocked * prevSupplied + rate * usdc) / nextSupplied) * 100) / 100
        return {
          position: {
            ...prev,
            suppliedUsdc: nextSupplied,
            lockedRatePct: blended,
            withdrawableNowUsd: Math.max(0, Number(prev.withdrawableNowUsd) || 0) + usdc,
            notePhase: 'funded',
            expectedEarnedUsd: Math.round(nextSupplied * (blended / 100) * 100) / 100,
            lastSupply: {
              amountUsdc: usdc,
              sender: DEMO_FUNDED.lastSupply!.sender,
              signature: DEMO_FUNDED.lastSupply!.signature,
              atMs: at,
            },
            pendingSupply: null,
          },
        }
      }
      const useDemoFigures = Math.abs(usdc - 5000) < 0.5
      if (useDemoFigures) {
        return {
          position: {
            ...DEMO_FUNDED,
            lockedRatePct: rate,
            suppliedAtMs: at,
            expectedEarnedUsd: Math.round(5000 * (rate / 100) * 100) / 100,
            lastSupply: {
              ...DEMO_FUNDED.lastSupply!,
              atMs: at,
              amountUsdc: 5000,
            },
            pendingSupply: null,
          },
        }
      }
      return {
        position: {
          ...EMPTY,
          suppliedUsdc: usdc,
          lockedRatePct: rate,
          usedUsdc: 0,
          withdrawableNowUsd: usdc,
          committedUsdc: 0,
          notePhase: 'funded',
          suppliedAtMs: at,
          expectedEarnedUsd: Math.round(usdc * (rate / 100) * 100) / 100,
          lastSupply: {
            amountUsdc: usdc,
            sender: DEMO_FUNDED.lastSupply!.sender,
            signature: DEMO_FUNDED.lastSupply!.signature,
            atMs: at,
          },
          pendingSupply: null,
        },
      }
    })
  },
  setPendingSupply: (pending) =>
    set((s) => ({
      position: { ...s.position, pendingSupply: pending },
    })),
  clearSupply: () => set({ position: { ...EMPTY } }),
}))

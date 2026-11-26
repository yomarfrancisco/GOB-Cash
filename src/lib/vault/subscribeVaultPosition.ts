'use client'

import { doc, onSnapshot } from 'firebase/firestore'
import { getFirebaseAuth, getFirestoreDb } from '@/lib/firebase'
import {
  useVaultStore,
  type VaultLastSupply,
  type VaultPendingSupply,
  type VaultPosition,
} from '@/store/vault'

function asLastSupply(raw: unknown): VaultLastSupply | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const amountUsdc = Number(o.amountUsdc)
  const sender = String(o.sender || '')
  const signature = String(o.signature || '')
  const atMs = Number(o.atMs) || 0
  if (!(amountUsdc > 0) || !sender || !signature) return null
  return { amountUsdc, sender, signature, atMs }
}

function asPending(raw: unknown): VaultPendingSupply | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const id = String(o.id || '')
  const reference = String(o.reference || '')
  const createdAtMs = Number(o.createdAtMs) || 0
  if (!id || !reference) return null
  return { id, reference, createdAtMs }
}

function mapPosition(data: Record<string, unknown> | undefined): VaultPosition {
  const suppliedUsdc = Math.max(0, Number(data?.suppliedUsdc) || 0)
  const withdrawableNowUsd = Math.max(0, Number(data?.withdrawableNowUsd) || 0)
  const usedUsdc = Math.max(
    0,
    Number(data?.usedUsdc) ||
      Number(data?.committedUsdc) ||
      Math.max(0, suppliedUsdc - withdrawableNowUsd)
  )
  const committedUsdc = Math.max(
    0,
    Number(data?.committedUsdc) || usedUsdc
  )
  const lockedRaw = data?.lockedRatePct
  const lockedRatePct =
    lockedRaw == null || lockedRaw === ''
      ? null
      : Number(lockedRaw)
  return {
    suppliedUsdc,
    trailingApyPct:
      data?.trailingApyPct == null ? null : Number(data.trailingApyPct) || null,
    lockedRatePct:
      lockedRatePct != null && Number.isFinite(lockedRatePct) ? lockedRatePct : null,
    usedUsdc,
    withdrawableNowUsd,
    committedUsdc,
    zarFunded: Math.max(0, Number(data?.zarFunded) || 0),
    zarEarned: Math.max(0, Number(data?.zarEarned) || 0),
    earnedUsdToday: Math.max(0, Number(data?.earnedUsdToday) || 0),
    deliveriesToday: Math.max(0, Number(data?.deliveriesToday) || 0),
    deliveriesZarToday: Math.max(0, Number(data?.deliveriesZarToday) || 0),
    suppliedAtMs: data?.suppliedAtMs == null ? null : Number(data.suppliedAtMs) || null,
    backAtMs: data?.backAtMs == null ? null : Number(data.backAtMs) || null,
    settledAtMs: data?.settledAtMs == null ? null : Number(data.settledAtMs) || null,
    returnedUsdc:
      data?.returnedUsdc == null ? null : Math.max(0, Number(data.returnedUsdc) || 0),
    notePhase:
      data?.notePhase === 'open' ||
      data?.notePhase === 'funded' ||
      data?.notePhase === 'settled' ||
      data?.notePhase === 'closed' ||
      data?.notePhase === 'late'
        ? data.notePhase
        : null,
    noteFull: data?.noteFull === true,
    legs: Array.isArray(data?.legs) ? (data!.legs as VaultPosition['legs']) : [],
    expectedEarnedUsd: Math.max(0, Number(data?.expectedEarnedUsd) || 0),
    linkedSolanaWallet:
      data?.linkedSolanaWallet == null ? null : String(data.linkedSolanaWallet),
    lastSupply: asLastSupply(data?.lastSupply),
    pendingSupply: asPending(data?.pendingSupply),
  }
}

/** Keep Zustand vault position in sync with Firestore. */
export function subscribeVaultPosition(): () => void {
  const auth = getFirebaseAuth()
  let unsubDoc: (() => void) | null = null

  const attach = (uid: string) => {
    unsubDoc?.()
    unsubDoc = onSnapshot(
      doc(getFirestoreDb(), 'users', uid, 'vault', 'position'),
      (snap) => {
        if (!snap.exists()) return
        useVaultStore.getState().replacePosition(mapPosition(snap.data() as Record<string, unknown>))
      },
      (err) => {
        console.warn('[Vault] position subscribe failed', err)
      }
    )
  }

  const unsubAuth = auth.onAuthStateChanged((user) => {
    unsubDoc?.()
    unsubDoc = null
    if (!user) {
      useVaultStore.getState().clearSupply()
      return
    }
    attach(user.uid)
  })

  return () => {
    unsubAuth()
    unsubDoc?.()
  }
}

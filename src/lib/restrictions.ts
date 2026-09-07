/**
 * Profile action locks.
 *
 * Activity is always open.
 * Deposit opens after KYC approval, or immediately for full-access UIDs.
 * Withdraw opens only for full-access UIDs.
 *
 * Full-access UIDs live in Firestore `config/access`.fullAccessUids
 * and can be edited in the Firebase console. The two default operators
 * are used until that document exists or if the list is empty.
 */

'use client'

import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { getFirestoreDb } from '@/lib/firebase'

export const ACCESS_CONFIG_COLLECTION = 'config'
export const ACCESS_CONFIG_DOC = 'access'

export const DEFAULT_FULL_ACCESS_UIDS = [
  'xHKmkizXhPOU25vwTIB6dxhMzSH2',
  'fgFeayjhTFWXyTXp3WepyCcIWIF2',
] as const

export function normalizeFullAccessUids(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...DEFAULT_FULL_ACCESS_UIDS]
  const uids = raw
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean)
  return uids.length > 0 ? uids : [...DEFAULT_FULL_ACCESS_UIDS]
}

export function isKycApproved(
  kycStatus?: string | null,
  kycSessionStatus?: string | null
): boolean {
  const status = (kycStatus || '').toLowerCase()
  const session = (kycSessionStatus || '').toLowerCase()
  return status === 'approved' || session === 'approved'
}

export function isFullAccessUid(uid: string | null | undefined, fullAccessUids: string[]): boolean {
  return Boolean(uid && fullAccessUids.includes(uid))
}

export function resolveProfileAccess(
  uid: string | null | undefined,
  options: { fullAccessUids: string[]; kycApproved: boolean }
) {
  const hasFullAccess = isFullAccessUid(uid, options.fullAccessUids)
  return {
    hasFullAccess,
    canViewActivity: true,
    canDeposit: hasFullAccess || options.kycApproved,
    canWithdraw: hasFullAccess,
  }
}

export function useFullAccessUids(): string[] {
  const [uids, setUids] = useState<string[]>(() => [...DEFAULT_FULL_ACCESS_UIDS])

  useEffect(() => {
    const db = getFirestoreDb()
    return onSnapshot(
      doc(db, ACCESS_CONFIG_COLLECTION, ACCESS_CONFIG_DOC),
      (snap) => {
        setUids(normalizeFullAccessUids(snap.data()?.fullAccessUids))
      },
      () => {
        setUids([...DEFAULT_FULL_ACCESS_UIDS])
      }
    )
  }, [])

  return uids
}

export function useProfileAccess(
  uid: string | null | undefined,
  kycStatus?: string | null,
  kycSessionStatus?: string | null
) {
  const fullAccessUids = useFullAccessUids()
  return resolveProfileAccess(uid, {
    fullAccessUids,
    kycApproved: isKycApproved(kycStatus, kycSessionStatus),
  })
}

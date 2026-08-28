import { doc, getDoc } from 'firebase/firestore'
import { getFirestoreDb } from '@/lib/firebase'
import { normalizeCashHandle } from '@/lib/agentCashQr'
import type { PublicDirectoryDoc } from '@/types/contacts'

export type CashPayee = {
  handle: string
  displayName: string | null
  avatarUrl: string | null
}

export async function fetchCashPayee(rawHandle: string): Promise<CashPayee | null> {
  const slug = normalizeCashHandle(rawHandle)
  if (!slug) return null

  const db = getFirestoreDb()
  const candidates = [`$${slug.toLowerCase()}`, slug.toLowerCase()]

  for (const id of candidates) {
    const snap = await getDoc(doc(db, 'publicDirectory', id))
    if (!snap.exists()) continue
    const data = snap.data() as PublicDirectoryDoc
    return {
      handle: slug,
      displayName: data.displayName || null,
      avatarUrl: data.avatarUrl || null,
    }
  }

  return {
    handle: slug,
    displayName: null,
    avatarUrl: null,
  }
}

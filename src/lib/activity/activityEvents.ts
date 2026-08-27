import { collection, onSnapshot, type Timestamp, type Unsubscribe } from 'firebase/firestore'
import { getFirebaseAuth, getFirestoreDb } from '@/lib/firebase'
import type { ActivityItem } from '@/store/activity'

export type ActivityEventDoc = {
  id?: string
  kind?: string
  title?: string
  body?: string
  actorType?: string
  avatarKind?: string
  amountCurrency?: 'MZN' | 'ZAR' | 'USDT'
  amountValue?: number
  amountSign?: 'credit' | 'debit'
  createdAt?: Timestamp | { toMillis?: () => number }
  txId?: string
}

function createdAtMs(value: ActivityEventDoc['createdAt']): number {
  if (!value) return Date.now()
  if (typeof (value as Timestamp).toMillis === 'function') {
    return (value as Timestamp).toMillis()
  }
  return Date.now()
}

export function activityEventToItem(eventId: string, data: ActivityEventDoc): ActivityItem {
  const actorType =
    data.actorType === 'ai_manager' ||
    data.avatarKind === 'zar_withdrawn' ||
    data.avatarKind === 'mzn_deposited' ||
    data.avatarKind === 'proof_of_payment' ||
    data.kind === 'BANK_TRANSFER_CONFIRMED' ||
    data.kind === 'WITHDRAWAL_INSTRUCTED' ||
    data.kind === 'EXTERNAL_DEPOSIT_CONFIRMED' ||
    data.kind === 'CONVERSION_INSTRUCTED' ||
    data.kind === 'DEPOSIT_PROOF_PENDING' ||
    data.kind === 'DEPOSIT_PROOF_FAILED' ||
    data.kind === 'DEPOSIT_CREDITED'
      ? 'ai'
      : data.actorType === 'counterparty'
        ? 'counterparty'
        : 'user'

  return {
    id: data.id || data.txId || eventId,
    kind: data.kind,
    actor: {
      type: actorType,
      name: actorType === 'ai' ? 'Ama' : undefined,
    },
    title: data.title || 'Activity',
    body: data.body || undefined,
    amount: data.amountCurrency && typeof data.amountValue === 'number'
      ? {
          currency: data.amountCurrency,
          value: Math.abs(data.amountValue),
          sign: data.amountSign === 'credit' ? 'credit' : 'debit',
        }
      : undefined,
    createdAt: createdAtMs(data.createdAt),
    txId: data.txId,
  }
}

export function subscribeToActivityEvents(
  onChange: (items: ActivityItem[]) => void,
  options?: { onNew?: (items: ActivityItem[]) => void }
): Unsubscribe {
  const auth = getFirebaseAuth()
  let eventsUnsub: Unsubscribe | null = null

  const listen = (uid: string) => {
    eventsUnsub?.()
    let hydrated = false
    const eventsRef = collection(getFirestoreDb(), 'users', uid, 'activityEvents')
    eventsUnsub = onSnapshot(
      eventsRef,
      (snap) => {
        const items = snap.docs.map((docSnap) =>
          activityEventToItem(docSnap.id, docSnap.data() as ActivityEventDoc)
        )
        onChange(items)
        if (!hydrated) {
          hydrated = true
          return
        }
        const added = snap
          .docChanges()
          .filter((change) => change.type === 'added')
          .map((change) =>
            activityEventToItem(change.doc.id, change.doc.data() as ActivityEventDoc)
          )
        if (added.length) options?.onNew?.(added)
      },
      (error) => {
        console.error('[Activity] Failed to subscribe to activityEvents:', error)
        onChange([])
      }
    )
  }

  if (auth.currentUser?.uid) {
    listen(auth.currentUser.uid)
  }

  const authUnsub = auth.onAuthStateChanged((user) => {
    if (!user) {
      eventsUnsub?.()
      eventsUnsub = null
      onChange([])
      return
    }
    listen(user.uid)
  })

  return () => {
    authUnsub()
    eventsUnsub?.()
  }
}

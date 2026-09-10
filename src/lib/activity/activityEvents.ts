import { collection, onSnapshot, type Timestamp, type Unsubscribe } from 'firebase/firestore'
import { getFirebaseAuth, getFirestoreDb } from '@/lib/firebase'
import type { ActivityItem } from '@/store/activity'
import { conversionAvatar, TASK_AVATARS } from './taskAvatars'

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
  hasDownloadButton?: boolean
  dropdownTitle?: string
  dropdownBody?: string
  status?: string
  awaitingConfirm?: boolean
  testRunId?: string
  cycleNumber?: number
  routingAction?: 'replenish' | 'deploy' | string
  pairedAmountValue?: number
  feedbackAck?: string
  routingBlocked?: boolean
  routingRevision?: boolean
  userReply?: string
  userRepliedAt?: Timestamp | { toMillis?: () => number }
  proposalId?: string
  awaitingProposalAccept?: boolean
}

function createdAtMs(value: ActivityEventDoc['createdAt']): number {
  if (!value) return Date.now()
  if (typeof (value as Timestamp).toMillis === 'function') {
    return (value as Timestamp).toMillis()
  }
  return Date.now()
}

function avatarUrlForEvent(data: ActivityEventDoc): string | undefined {
  if (data.avatarKind === 'convert_zar') return TASK_AVATARS.convertZar
  if (data.avatarKind === 'convert_mzn') return TASK_AVATARS.convertMzn
  if (data.avatarKind === 'cash_agent_exchange') return TASK_AVATARS.cashAgent
  if (data.avatarKind === 'zar_withdrawn') return TASK_AVATARS.withdraw
  if (data.avatarKind === 'mzn_deposited' || data.avatarKind === 'proof_of_payment') {
    return TASK_AVATARS.deposit
  }
  if (data.kind === 'CONVERSION_INSTRUCTED') return conversionAvatar(data.amountCurrency)
  if (
    data.kind === 'WEEKLY_SETTLEMENT_STATEMENT' ||
    data.kind === 'MONTHLY_SETTLEMENT_STATEMENT'
  ) {
    return TASK_AVATARS.convertZar
  }
  if (data.kind === 'CONVERSION_ROUTING_INSTRUCTION') {
    return data.avatarKind === 'convert_mzn' ? TASK_AVATARS.convertMzn : TASK_AVATARS.convertZar
  }
  if (
    data.kind === 'DEPOSIT_PROOF_PENDING' ||
    data.kind === 'DEPOSIT_PROOF_FAILED' ||
    data.kind === 'EXTERNAL_DEPOSIT_CONFIRMED' ||
    data.kind === 'DEPOSIT_CREDITED'
  ) {
    return TASK_AVATARS.deposit
  }
  if (data.kind === 'WITHDRAWAL_INSTRUCTED' || data.kind === 'BANK_TRANSFER_CONFIRMED') {
    return TASK_AVATARS.withdraw
  }
  return undefined
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
    data.kind === 'CONVERSION_ROUTING_INSTRUCTION' ||
    data.kind === 'WEEKLY_SETTLEMENT_STATEMENT' ||
    data.kind === 'MONTHLY_SETTLEMENT_STATEMENT' ||
    data.avatarKind === 'convert_mzn' ||
    data.avatarKind === 'convert_zar' ||
    data.avatarKind === 'cash_agent_exchange' ||
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
      name:
        data.kind === 'WEEKLY_SETTLEMENT_STATEMENT' ||
        data.kind === 'MONTHLY_SETTLEMENT_STATEMENT' ||
        (data.kind === 'CONVERSION_ROUTING_INSTRUCTION' && data.routingAction !== 'replenish')
          ? '$ariel'
          : actorType === 'ai'
            ? 'Ama'
            : undefined,
      avatarUrl: avatarUrlForEvent(data),
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
    hasDownloadButton: data.hasDownloadButton === true,
    avatarKind: data.avatarKind,
    status: data.status,
    dropdownTitle: data.dropdownTitle,
    dropdownBody: data.dropdownBody,
    testRunId: data.testRunId,
    cycleNumber: data.cycleNumber,
    routingAction: data.routingAction,
    pairedAmountValue: data.pairedAmountValue,
    feedbackAck: typeof data.feedbackAck === 'string' ? data.feedbackAck : undefined,
    routingBlocked: data.routingBlocked === true,
    awaitingConfirm: data.status === 'superseded' || data.status === 'completed' || data.status === 'cancelled'
      ? false
      : data.awaitingConfirm === true || data.status === 'awaiting_execution',
    routingRevision: data.routingRevision === true,
    userReply: typeof data.userReply === 'string' && data.userReply.trim() ? data.userReply.trim() : undefined,
    userRepliedAt: data.userRepliedAt ? createdAtMs(data.userRepliedAt) : undefined,
    proposalId: typeof data.proposalId === 'string' && data.proposalId.trim() ? data.proposalId.trim() : undefined,
    awaitingProposalAccept: data.awaitingProposalAccept === true && data.status !== 'cancelled' && data.status !== 'accepted',
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

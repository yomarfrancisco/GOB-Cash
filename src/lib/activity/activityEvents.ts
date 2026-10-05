import { collection, onSnapshot, type Timestamp, type Unsubscribe } from 'firebase/firestore'
import { getFirebaseAuth, getFirestoreDb } from '@/lib/firebase'
import type { ActivityItem } from '@/store/activity'
import { conversionAvatar, TASK_AVATARS } from './taskAvatars'
import { DESK_TEAM, deskAgentFor } from '@/lib/desk/threadModel'

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
  invoiceId?: string
  invoiceStoragePath?: string
  invoicePackId?: string
  invoiceZipStoragePath?: string
  invoiceZipFilename?: string
  invoiceIds?: string[]
  proofZipStoragePath?: string
  proofZipFilename?: string
  deskHidden?: boolean
  dropdownTitle?: string
  dropdownBody?: string
  status?: string
  awaitingConfirm?: boolean
  testRunId?: string
  cycleNumber?: number
  routingAction?: 'replenish' | 'deploy' | string
  deskSpeaker?: 'sam' | 'leo' | 'amina'
  pairedAmountValue?: number
  feedbackAck?: string
  routingBlocked?: boolean
  routingRevision?: boolean
  userReply?: string
  userRepliedAt?: Timestamp | { toMillis?: () => number }
  proposalId?: string
  awaitingProposalAccept?: boolean
  pursueLabel?: string
  optionCount?: number
  recommendedOptionId?: string
  startNextRun?: boolean
  questionKind?: string
  deskTable?: {
    id?: string
    title?: string
    columns?: unknown
    rows?: unknown
  }
  deskChart?: {
    id?: string
    title?: string
    unit?: string
    series?: unknown
  }
  earliestAttemptAt?: string
  ticketPath?: { tickets?: Array<{ timeLabel?: string | null }> | null } | null
  operatingPolicyVersion?: string
  operatingBrief?: ActivityItem['operatingBrief']
  ticketSplits?: Array<{ cardId?: number; amountZar?: number; bankShort?: string }>
}

function asTicketSplits(
  raw: ActivityEventDoc['ticketSplits']
): ActivityItem['ticketSplits'] {
  if (!Array.isArray(raw) || !raw.length) return undefined
  const rows = raw.flatMap((row) => {
    const cardId = Number(row?.cardId)
    const amountZar = Number(row?.amountZar)
    const bankShort = typeof row?.bankShort === 'string' ? row.bankShort : ''
    if (!(cardId > 0) || !(amountZar > 0) || !bankShort) return []
    return [{ cardId, amountZar, bankShort }]
  })
  return rows.length ? rows : undefined
}

function asTicketPath(raw: ActivityEventDoc['ticketPath']): ActivityItem['ticketPath'] {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.tickets) || !raw.tickets.length) {
    return undefined
  }
  const tickets = raw.tickets.map((row) => ({
    timeLabel: typeof row?.timeLabel === 'string' ? row.timeLabel : null,
  }))
  return { tickets }
}

function asDeskTable(raw: ActivityEventDoc['deskTable']): ActivityItem['deskTable'] {
  if (!raw || !Array.isArray(raw.columns) || !Array.isArray(raw.rows)) return undefined
  const columns = raw.columns.filter((cell): cell is string => typeof cell === 'string')
  const rows = raw.rows.flatMap((row) => {
    if (!row || typeof row !== 'object') return []
    const cells = Array.isArray((row as { cells?: unknown }).cells)
      ? ((row as { cells: unknown[] }).cells.filter((cell): cell is string => typeof cell === 'string'))
      : []
    return cells.length ? [{ cells }] : []
  })
  if (!columns.length || !rows.length) return undefined
  return {
    id: typeof raw.id === 'string' ? raw.id : 'table',
    title: typeof raw.title === 'string' ? raw.title : '',
    columns,
    rows,
  }
}

function asDeskChart(raw: ActivityEventDoc['deskChart']): ActivityItem['deskChart'] {
  if (!raw || !Array.isArray(raw.series)) return undefined
  const series = raw.series.flatMap((row) => {
    if (!row || typeof row !== 'object') return []
    const item = row as { label?: unknown; points?: unknown }
    if (typeof item.label !== 'string' || !Array.isArray(item.points)) return []
    const points = item.points.flatMap((point) => {
      if (!point || typeof point !== 'object') return []
      const cell = point as { label?: unknown; value?: unknown }
      if (typeof cell.label !== 'string' || typeof cell.value !== 'number' || !Number.isFinite(cell.value)) {
        return []
      }
      return [{ label: cell.label, value: cell.value }]
    })
    return points.length ? [{ label: item.label, points }] : []
  })
  if (!series.length) return undefined
  return {
    id: typeof raw.id === 'string' ? raw.id : 'chart',
    title: typeof raw.title === 'string' ? raw.title : '',
    unit: raw.unit === 'MZN' ? 'MZN' : 'ZAR',
    series,
  }
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
    return DESK_TEAM[deskAgentFor(data)].avatar
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
        data.kind === 'CONVERSION_ROUTING_INSTRUCTION'
          ? DESK_TEAM[deskAgentFor(data)].name
          : data.kind === 'WEEKLY_SETTLEMENT_STATEMENT' || data.kind === 'MONTHLY_SETTLEMENT_STATEMENT'
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
    invoiceId:
      typeof data.invoiceId === 'string' && data.invoiceId.trim() ? data.invoiceId.trim() : undefined,
    invoiceStoragePath:
      typeof data.invoiceStoragePath === 'string' && data.invoiceStoragePath.trim()
        ? data.invoiceStoragePath.trim()
        : undefined,
    invoicePackId:
      typeof data.invoicePackId === 'string' && data.invoicePackId.trim()
        ? data.invoicePackId.trim()
        : undefined,
    invoiceZipStoragePath:
      typeof data.invoiceZipStoragePath === 'string' && data.invoiceZipStoragePath.trim()
        ? data.invoiceZipStoragePath.trim()
        : undefined,
    invoiceZipFilename:
      typeof data.invoiceZipFilename === 'string' && data.invoiceZipFilename.trim()
        ? data.invoiceZipFilename.trim()
        : undefined,
    invoiceIds: Array.isArray(data.invoiceIds)
      ? data.invoiceIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      : undefined,
    proofZipStoragePath:
      typeof data.proofZipStoragePath === 'string' && data.proofZipStoragePath.trim()
        ? data.proofZipStoragePath.trim()
        : undefined,
    proofZipFilename:
      typeof data.proofZipFilename === 'string' && data.proofZipFilename.trim()
        ? data.proofZipFilename.trim()
        : undefined,
    deskHidden: data.deskHidden === true,
    avatarKind: data.avatarKind,
    status: data.status,
    dropdownTitle: data.dropdownTitle,
    dropdownBody: data.dropdownBody,
    testRunId: data.testRunId,
    cycleNumber: data.cycleNumber,
    routingAction: data.routingAction,
    deskSpeaker:
      data.deskSpeaker === 'leo' || data.deskSpeaker === 'amina' || data.deskSpeaker === 'sam'
        ? data.deskSpeaker
        : undefined,
    pairedAmountValue: data.pairedAmountValue,
    feedbackAck: typeof data.feedbackAck === 'string' ? data.feedbackAck : undefined,
    routingBlocked: data.routingBlocked === true,
    awaitingConfirm:
      data.status === 'superseded' ||
      data.status === 'completed' ||
      data.status === 'cancelled' ||
      data.status === 'pending_mzn'
        ? false
        : data.awaitingConfirm === false
          ? false
          : data.awaitingConfirm === true || data.status === 'awaiting_execution',
    routingRevision: data.routingRevision === true,
    userReply: typeof data.userReply === 'string' && data.userReply.trim() ? data.userReply.trim() : undefined,
    userRepliedAt: data.userRepliedAt ? createdAtMs(data.userRepliedAt) : undefined,
    proposalId: typeof data.proposalId === 'string' && data.proposalId.trim() ? data.proposalId.trim() : undefined,
    awaitingProposalAccept: data.awaitingProposalAccept === true && data.status !== 'cancelled' && data.status !== 'accepted',
    pursueLabel: typeof data.pursueLabel === 'string' && data.pursueLabel.trim() ? data.pursueLabel.trim() : undefined,
    optionCount: typeof data.optionCount === 'number' ? data.optionCount : undefined,
    recommendedOptionId:
      typeof data.recommendedOptionId === 'string' && data.recommendedOptionId.trim()
        ? data.recommendedOptionId.trim()
        : undefined,
    startNextRun: data.startNextRun === true,
    deskTable: asDeskTable(data.deskTable),
    deskChart: asDeskChart(data.deskChart),
    ticketSplits: asTicketSplits(data.ticketSplits),
    earliestAttemptAt:
      typeof data.earliestAttemptAt === 'string' && data.earliestAttemptAt.trim()
        ? data.earliestAttemptAt.trim()
        : undefined,
    ticketPath: asTicketPath(data.ticketPath),
    operatingPolicyVersion:
      typeof data.operatingPolicyVersion === 'string' ? data.operatingPolicyVersion : undefined,
    operatingBrief:
      data.operatingBrief && typeof data.operatingBrief === 'object'
        ? (data.operatingBrief as ActivityItem['operatingBrief'])
        : undefined,
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

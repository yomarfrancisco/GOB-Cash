import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type ActivityItem = {
  id: string
  kind?:
    | 'payment_sent'
    | 'payment_delivered'
    | 'payment_received'
    | 'proof_of_payment'
    | 'mzn_deposited'
    | 'zar_withdrawn'
    | 'WITHDRAWAL_INSTRUCTED'
    | 'BANK_TRANSFER_CONFIRMED'
    | 'EXTERNAL_DEPOSIT_CONFIRMED'
    | 'CONVERSION_INSTRUCTED'
    | 'KYC_REQUIRED'
    | string
  actor: { type: 'ai' | 'user' | 'counterparty'; name?: string; avatarUrl?: string }
  title: string
  body?: string
  amount?: { currency: 'MZN' | 'ZAR' | 'USDT'; value: number; sign: 'credit' | 'debit' }
  createdAt: number
  routeOnTap?: string
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
  avatarKind?: string
  hasKycLink?: boolean
  status?: string
  dropdownTitle?: string
  dropdownBody?: string
  testRunId?: string
  cycleNumber?: number
  awaitingConfirm?: boolean
  routingAction?: string
  deskSpeaker?: 'sam' | 'leo' | 'amina'
  pairedAmountValue?: number
  feedbackAck?: string
  routingBlocked?: boolean
  routingRevision?: boolean
  thinking?: boolean
  userReply?: string
  userRepliedAt?: number
  proposalId?: string
  awaitingProposalAccept?: boolean
  pursueLabel?: string
  optionCount?: number
  recommendedOptionId?: string
  startNextRun?: boolean
  kycAction?: 'start' | 'update'
  /** Step 4 ticket weights for live bank-COST spread / profit. */
  ticketSplits?: Array<{ cardId: number; amountZar: number; bankShort: string }>
  deskTable?: {
    id: string
    title: string
    columns: string[]
    rows: Array<{ cells: string[] }>
  }
  deskChart?: {
    id: string
    title: string
    unit: 'ZAR' | 'MZN'
    series: Array<{ label: string; points: Array<{ label: string; value: number }> }>
  }
  /** Routing Manager Step 1 / Step 6 structured plan card. */
  routingStepMessage?: import('@/lib/desk/routingStepMessage').RoutingStepMessage
  /** Part 1 ledger / status presentation for Steps 2–5. */
  deskSentence?: string
  deskStatusChip?: string
  deskPendingChip?: string
  deskNextFooter?: string
  deskPlanChip?: string
  deskStep?: number
  /** Planned-run writes — hidden when the desk returns to live. */
  simulated?: boolean
  planRunId?: string
  /** Step 6 Advance button target day (must match deskNextFooter). */
  deskAdvanceDay?: number
  deskLedgerRows?: Array<{
    label: string
    value: string
    valueStrong?: boolean
    secondLine?: string
    copyable?: boolean
  }>
  /** Day-1 pipe cards (MZN → ZAR → bank). */
  deskPipes?: Array<{
    id: string
    /** Small currency / lane label above the amount (MZN, ZAR, BANK). */
    label?: string
    title: string
    subtitle?: string
    fillPct?: number
    tone?: 'mzn' | 'zar' | 'bank' | string
  }>
  deskPipeCaption?: string
  /** Day-1 liquid now mode from Routing Manager. */
  liquidNowMode?: 'full' | 'partial' | 'none'
  mznResidual?: number
  mznConverted?: number
  /** Linked payout destination tag, e.g. "Absa ··2319". */
  payoutBankTag?: string
  /** Running total paid to payoutBankTag (You're set up card). */
  payoutCumulativeZar?: number
  payoutScheduled?: boolean
  payoutPaidAtMs?: number
  /** Numbered next steps under a fund / intro card. */
  deskSteps?: string[]
  /** Fine print under a fund / intro card. */
  deskNote?: string
  /** Optional second-language fine print (e.g. Portuguese). */
  deskNoteAlt?: string
  /** Moza account number for fund_intro copy actions. */
  fundAccountNumber?: string
  paymentReference?: string
  /** Desk calculator fund-wire target amounts (sell-rate quote). */
  fundTargetMzn?: number
  fundTargetZar?: number
  /** Read-only bank learning probes attached to a simulated Step 2. */
  deskBankEmailRound?: {
    roundId: string
    due: boolean
    horizonHours: 24 | 72
    dayLabel: string
    expectedReplyLabel: string
    nextRoundLabel: string
    selected: Array<{
      bankKey: string
      bank: string
      shortBank: string
      banker: string
      to: string
      reason: string
      testedAmountZar: number
      sendTimeLabel: string
      subject: string
      bodyPt: string
      attachments: Array<{ ticketId: string; filename: string; amountZar: number }>
    }>
    notSelected: string[]
  }
  /** Synthetic reply expectations; never parsed as real bank evidence. */
  deskBankExpectedReplies?: {
    roundId: string
    roundLabel: string
    replies: {
      replyAtMs: number
      rows: Array<{
        bankKey: string
        bank: string
        banker: string
        testedAmountZar: number
        status: 'expected'
        wouldLearn: string
      }>
    }
  }
  orderLedger?: import('@/lib/desk/routingStepMessage').OrderLedger
  /** Binding Confirm earliest time (ISO). */
  earliestAttemptAt?: string
  /** Scheduled swipe clocks for Step 5 (kept after Planned / Confirm). */
  ticketPath?: { tickets?: Array<{ timeLabel?: string | null }> | null } | null
  operatingPolicyVersion?: string
  operatingBrief?: {
    monthLabel?: string
    operatingDayIndex?: number
    operatingDayCount?: number
    ceilingTodayZar?: number
    monthRemainingZar?: number
    requiredWorkingLiquidityZar?: number
    workingLiquidityHeadroomZar?: number
    attemptTimeLabel?: string | null
    routeReason?: string | null
    replanReason?: string | null
    cardMaturityNote?: string | null
  }
  /** Client-side same-day desk event ledger (synthetic group item). */
  deskEventGroup?: import('@/lib/desk/deskEventGroups').DeskEventGroup
  /** Over-instant routing plan (card planned days + parallel EFT T+2). */
  routingPlan?: {
    sentence: string
    fundedMzn: number
    zarTotal: number
    zarLiquid: number
    mznResidual: number
    rate: number
    liquidPct: number
    legs: Array<{
      whenLabel: string
      subLabel: string
      amountZar: number
      confidence: 'now' | 'reserved' | 'estimated' | string
      chip: string
      landsAtMs: number | null
      channel?: 'instant' | 'card' | 'eft' | string
    }>
    fullLiquidAtMs: number | null
    fullLiquidLabel: string
    payoutBankTag: string | null
    note: string
    cardZar?: number
    eftZar?: number
  }
  /** Liquidity report (pipe) — live or frozen snapshot. */
  liquidityLive?: boolean
  liquidityChanges?: string[]
  liquidityReport?: {
    live: boolean
    chips: string[]
    fullLiquidityLabel: string
    fullLiquidityAt: number | null
    liquidZar: number
    fundedZar: number
    fundedMzn: number
    rate: number
    liquidPct: string
    pipeSegments: Array<{ kind: string; amountZar: number }>
    timeline: Array<{
      kind: string
      amountZar: number
      landsAt: number | null
      label: string
      whenLabel: string
      done: boolean
    }>
    note: string
    withdrawZar: number
    reconciled: boolean
    unaccountedZar: number
  }
}

const MAX_ACTIVITY_ITEMS = 80

function capItems(items: ActivityItem[]): ActivityItem[] {
  return [...items]
    .filter((item) => item && typeof item.id === 'string' && Number.isFinite(item.createdAt))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_ACTIVITY_ITEMS)
}

const quotaSafeStorage = createJSONStorage(() => ({
  getItem: (name) => {
    try {
      return localStorage.getItem(name)
    } catch {
      return null
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value)
    } catch {
      try {
        localStorage.removeItem(name)
        localStorage.setItem(name, value)
      } catch {
        // In-memory activity still works; Firebase is the source of truth.
      }
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name)
    } catch {
      // ignore
    }
  },
}))

type ActivityState = {
  items: ActivityItem[]
  add: (item: ActivityItem) => void
  addMany: (items: ActivityItem[]) => void
  clear: () => void
  all: () => ActivityItem[]
}

export const useActivityStore = create<ActivityState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (item) => set({ items: capItems([item, ...get().items]) }),
      addMany: (arr) => set({ items: capItems([...arr, ...get().items]) }),
      clear: () => set({ items: [] }),
      all: () => {
        try {
          const state = get()
          const items = state?.items
          return Array.isArray(items) ? items : []
        } catch {
          return []
        }
      },
    }),
    {
      name: 'activity-store-v2',
      version: 3,
      storage: quotaSafeStorage,
      partialize: (state) => ({ items: state.items }),
      migrate: (persisted) => {
        const state = persisted as { items?: ActivityItem[] }
        return { items: capItems(Array.isArray(state?.items) ? state.items : []) }
      },
    }
  )
)


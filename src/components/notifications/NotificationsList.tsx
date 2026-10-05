'use client'

import { useMemo, useEffect, useState, useRef, useCallback } from 'react'
import Image from 'next/image'
import { Check, Download, ExternalLink, ArrowUp } from 'lucide-react'
import { useActivityStore, type ActivityItem } from '@/store/activity'
import { subscribeToActivityEvents } from '@/lib/activity/activityEvents'
import {
  downloadConversionProof,
  downloadMonthlySettlementProof,
  downloadWeeklySettlementProof,
  downloadSettlementInvoice,
  admin_submitConversionRoutingFeedback,
  admin_simulateNextDeskDay,
  admin_exitDeskPlan,
} from '@/lib/transactions/clientFunctions'
import { isConversionInFlight } from '@/lib/transactions/submitInternalConversion'
import {
  markDeskKeypadOffered,
  openDeskKeypad,
  routingKeypadOfferKey,
  wasDeskKeypadOffered,
} from '@/lib/desk/openDeskKeypad'
import { useRoutingPlaybackStore } from '@/store/routingPlayback'
import { useAuthStore } from '@/store/auth'
import { formatRelativeShort } from '@/lib/formatRelativeTime'
import { formatVisibleSast } from '@/lib/routing/routingTime'
import { parseRoutingAssignmentsFromBody } from '@/lib/routing/interpretAdminFeedback'
import { conversionAvatar, TASK_AVATARS } from '@/lib/activity/taskAvatars'
import { DESK_TEAM, deskAgentFor, activeDeskAgent, addressedDeskAgent } from '@/lib/desk/threadModel'
import { DESK_CATCHUP_MS, useProgressiveReveal } from '@/lib/desk/useProgressiveReveal'
import { useDeskSpeakerStore } from '@/store/deskSpeaker'
import { useDeskFocusStore } from '@/store/deskFocus'
import { useDeskPlanStore } from '@/store/deskPlan'
import {
  displayDeskBody,
  displayDeskTitle,
  enrichRecycleBodyWithLiveCost,
  enrichSendBodyWithLiveSpread,
  executedPillLabel,
} from '@/lib/desk/deskCopy'
import { useFxRates } from '@/lib/exchangeRates/useFxRates'
import { isUserPlaceholderAvatar, MOZPAGA_ADMIN_AVATAR, USER_PLACEHOLDER_AVATAR } from '@/lib/notifications/identityResolver'
import { useUserProfileStore } from '@/store/userProfile'
import Avatar from '@/components/Avatar'
import { useNotificationsStore } from '@/state/notifications'
import { useRouter } from 'next/navigation'
import { useSignedInKycAccess } from '@/lib/restrictions'
import { prefetchDiditSdk, startDiditVerification } from '@/lib/startDiditVerification'
import styles from '@/app/activity/activity.module.css'
import listStyles from '@/components/Inbox/FinancialInboxListSheet.module.css'
import { DeskCardVisuals } from '@/components/notifications/DeskCardVisuals'
import { TypewriterText } from '@/components/desk/TypewriterText'
import { highlightDeskText } from '@/lib/desk/highlightDeskText'

const KYC_GATE_ID = 'kyc-desk-gate'

const ADMIN_AVATAR_PATH = MOZPAGA_ADMIN_AVATAR
const ACTIVITY_PAGE_SIZE = 16

function TypewriterCompleteSignal({ onComplete }: { onComplete: () => void }) {
  useEffect(() => {
    onComplete()
  }, [onComplete])
  return null
}

function isCopiedActivity(item: ActivityItem): boolean {
  return searchableText(item).includes('copied')
}

function groupByTimePeriod(items: ActivityItem[]) {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const todayStart = startOfToday.getTime()
  const oneDay = 24 * 60 * 60 * 1000
  const yesterdayStart = todayStart - oneDay
  const last7DaysStart = todayStart - 7 * oneDay
  const last30DaysStart = todayStart - 30 * oneDay

  const today: typeof items = []
  const yesterday: typeof items = []
  const last7Days: typeof items = []
  const last30Days: typeof items = []
  const older: typeof items = []

  items.forEach((item) => {
    if (item.createdAt >= todayStart) {
      today.push(item)
    } else if (item.createdAt >= yesterdayStart) {
      yesterday.push(item)
    } else if (item.createdAt >= last7DaysStart) {
      last7Days.push(item)
    } else if (item.createdAt >= last30DaysStart) {
      last30Days.push(item)
    } else {
      older.push(item)
    }
  })

  return { today, yesterday, last7Days, last30Days, older }
}

function searchableText(item: ActivityItem): string {
  return `${item.title} ${item.body ?? ''} ${item.userReply ?? ''} ${item.actor.name ?? ''}`.toLowerCase()
}

function isStandaloneConversionPop(item: ActivityItem): boolean {
  if (item.deskHidden === true) return true
  if (item.routingAction === 'pop_pack') return true
  if (item.kind === 'CONVERSION_INSTRUCTED') return true
  if (item.kind === 'proof_of_payment') return true
  return /^(ZAR sold at SELL|ZAR sourced at COST)\b/i.test(item.title || '')
}

function isPaymentActivity(item: ActivityItem): boolean {
  // Conversion POPs live on Step 4/5 as a zip, not as extra bubbles.
  if (isStandaloneConversionPop(item)) return false
  if (
    item.kind &&
    [
      'payment_sent',
      'payment_delivered',
      'payment_received',
      'proof_of_payment',
      'mzn_deposited',
      'zar_withdrawn',
      'WITHDRAWAL_INSTRUCTED',
      'BANK_TRANSFER_CONFIRMED',
      'EXTERNAL_DEPOSIT_CONFIRMED',
      'CONVERSION_INSTRUCTED',
      'CONVERSION_ROUTING_INSTRUCTION',
      'WEEKLY_SETTLEMENT_STATEMENT',
      'MONTHLY_SETTLEMENT_STATEMENT',
      'DEPOSIT_PROOF_PENDING',
      'DEPOSIT_PROOF_FAILED',
      'DEPOSIT_CREDITED',
      'KYC_REQUIRED',
    ].includes(item.kind)
  ) {
    return true
  }
  const text = searchableText(item)
  return [
    'payment',
    'paid',
    'delivered',
    'received',
    'proof',
    'deposit',
    'deposited',
    'withdraw',
    'withdrawn',
    'confirmed',
    'transfer',
    'settlement',
    'statement',
  ].some((keyword) => text.includes(keyword))
}

function isWelcomeSignIn(item: ActivityItem): boolean {
  return /^signed in with (google|phone)$/i.test(item.title.trim())
}

function isKycGateItem(item: ActivityItem): boolean {
  return item.kind === 'KYC_REQUIRED' || item.id === KYC_GATE_ID
}

function buildKycGateItem(cta: 'Start KYC' | 'Update KYC', createdAt: number): ActivityItem {
  const started = cta === 'Update KYC'
  return {
    id: KYC_GATE_ID,
    kind: 'KYC_REQUIRED',
    actor: { type: 'ai', name: 'MozPaga', avatarUrl: ADMIN_AVATAR_PATH },
    title: 'Identity verification required',
    body: started
      ? 'Your KYC is not approved yet. Update your documents before adding liquidity or withdrawing. This desk will not continue until verification is complete.'
      : 'Add liquidity and withdrawals need a completed KYC check. Start verification to continue. This desk will not move money before that.',
    createdAt,
    kycAction: started ? 'update' : 'start',
    awaitingConfirm: false,
  }
}

function resolveTaskAvatar(item: ActivityItem): string {
  if (item.actor.avatarUrl && !isUserPlaceholderAvatar(item.actor.avatarUrl)) {
    return item.actor.avatarUrl
  }
  if (isWelcomeSignIn(item) || isKycGateItem(item)) return ADMIN_AVATAR_PATH
  if (item.avatarKind === 'convert_zar') return TASK_AVATARS.convertZar
  if (item.avatarKind === 'convert_mzn') return TASK_AVATARS.convertMzn
  if (item.avatarKind === 'cash_agent_exchange') return TASK_AVATARS.cashAgent

  if (
    item.kind === 'CONVERSION_INSTRUCTED' ||
    item.kind === 'CONVERSION_ROUTING_INSTRUCTION' ||
    item.kind === 'WEEKLY_SETTLEMENT_STATEMENT' ||
    item.kind === 'MONTHLY_SETTLEMENT_STATEMENT'
  ) {
    if (item.kind === 'CONVERSION_ROUTING_INSTRUCTION') {
      return DESK_TEAM[deskAgentFor(item)].avatar
    }
    return item.kind === 'WEEKLY_SETTLEMENT_STATEMENT' ||
      item.kind === 'MONTHLY_SETTLEMENT_STATEMENT'
      ? TASK_AVATARS.convertZar
      : conversionAvatar(item.amount?.currency)
  }

  if (
    item.kind === 'proof_of_payment' ||
    item.kind === 'DEPOSIT_PROOF_PENDING' ||
    item.kind === 'DEPOSIT_PROOF_FAILED' ||
    item.kind === 'mzn_deposited' ||
    item.kind === 'EXTERNAL_DEPOSIT_CONFIRMED' ||
    item.kind === 'DEPOSIT_CREDITED'
  ) {
    return TASK_AVATARS.deposit
  }

  if (
    item.kind === 'zar_withdrawn' ||
    item.kind === 'WITHDRAWAL_INSTRUCTED' ||
    item.kind === 'BANK_TRANSFER_CONFIRMED'
  ) {
    return TASK_AVATARS.withdraw
  }

  if (
    item.kind === 'payment_delivered' ||
    item.kind === 'payment_received' ||
    item.kind === 'payment_sent'
  ) {
    return USER_PLACEHOLDER_AVATAR
  }

  const text = searchableText(item)
  if (text.includes('mzn') && (text.includes('deposit') || text.includes('deposited'))) {
    return TASK_AVATARS.deposit
  }
  if (text.includes('zar') && (text.includes('withdraw') || text.includes('withdrawn'))) {
    return TASK_AVATARS.withdraw
  }
  if (text.includes('delivered') || text.includes('received') || text.includes('sent') || text.includes('paid')) {
    return USER_PLACEHOLDER_AVATAR
  }
  return item.actor.avatarUrl || USER_PLACEHOLDER_AVATAR
}

function isInvoiceDownloadItem(item: ActivityItem): boolean {
  return (
    item.routingAction === 'invoice' ||
    Boolean(item.invoiceId) ||
    Boolean(item.invoicePackId) ||
    Boolean(item.invoiceZipStoragePath)
  )
}

function isPopPackDownloadItem(item: ActivityItem): boolean {
  return item.routingAction === 'pop_pack' || Boolean(item.proofZipStoragePath)
}

function canDownloadProof(item: ActivityItem): boolean {
  if (isInvoiceDownloadItem(item)) {
    return (
      item.hasDownloadButton === true ||
      Boolean(item.invoiceId) ||
      Boolean(item.invoiceZipStoragePath)
    )
  }
  if (isPopPackDownloadItem(item)) {
    return item.hasDownloadButton === true || Boolean(item.proofZipStoragePath)
  }
  if (!item.txId) return false
  return (
    item.hasDownloadButton === true ||
    item.kind === 'CONVERSION_INSTRUCTED' ||
    item.kind === 'WEEKLY_SETTLEMENT_STATEMENT' ||
    item.kind === 'MONTHLY_SETTLEMENT_STATEMENT'
  )
}

function isAwaitingRoutingItem(item: ActivityItem): boolean {
  return (
    item.kind === 'CONVERSION_ROUTING_INSTRUCTION' &&
    item.thinking !== true &&
    item.awaitingConfirm === true &&
    item.routingAction !== 'advice' &&
    item.routingAction !== 'proposal' &&
    item.status !== 'completed' &&
    item.status !== 'superseded' &&
    item.status !== 'cancelled'
  )
}

function isSequentialStepCard(item: ActivityItem | null | undefined): boolean {
  return item?.routingAction === 'step'
}

function isAskCard(item: ActivityItem): boolean {
  return item.routingAction === 'advice' || item.routingAction === 'proposal'
}

function isMznShortStepCard(item: ActivityItem): boolean {
  if (!isSequentialStepCard(item) || !isAwaitingRoutingItem(item)) return false
  if (!/^Step\s*3\b/i.test(item.title || '')) return false
  const text = `${item.body || ''}\n${item.dropdownBody || ''}`
  return /waiting for full mzn|still short on mzn|waiting on mzn/i.test(text)
}

function isRestockKeypadCard(item: ActivityItem): boolean {
  return (
    isAwaitingRoutingItem(item) &&
    item.routingBlocked !== true &&
    item.routingAction === 'replenish'
  )
}

/** Send / Restock cards that should animate the keypad during 1-day catch-up. */
function isCatchupKeypadCard(item: ActivityItem): boolean {
  if (item.thinking === true || item.routingBlocked === true) return false
  if (item.routingAction !== 'deploy' && item.routingAction !== 'replenish') return false
  return typeof item.amount?.value === 'number' && item.amount.value > 0
}

function openCatchupPlaybackKeypad(item: ActivityItem): boolean {
  if (item.routingAction === 'deploy') {
    const amountZAR = item.amount?.value
    if (!(typeof amountZAR === 'number') || amountZAR <= 0) return false
    return openDeskKeypad({
      destination: 'MZN',
      amountZAR,
      amountMZN: typeof item.pairedAmountValue === 'number' ? item.pairedAmountValue : 0,
      testRunId: item.testRunId,
      cycleNumber: item.cycleNumber,
      routingAction: 'deploy',
      playbackOnly: true,
    })
  }
  if (item.routingAction === 'replenish') {
    const amountMZN = item.amount?.value
    if (!(typeof amountMZN === 'number') || amountMZN <= 0) return false
    return openDeskKeypad({
      destination: 'ZAR',
      amountZAR: typeof item.pairedAmountValue === 'number' ? item.pairedAmountValue : 0,
      amountMZN,
      testRunId: item.testRunId,
      cycleNumber: item.cycleNumber,
      routingAction: 'replenish',
      playbackOnly: true,
    })
  }
  return false
}

function latestAwaitingRoutingId(items: ActivityItem[]): string | null {
  return items.find(isAwaitingRoutingItem)?.id ?? null
}

function confirmTargetForCard(item: ActivityItem): ActivityItem | null {
  if (isAskCard(item)) return null
  if (isAwaitingRoutingItem(item) && item.routingBlocked !== true) return item
  return null
}

function ActivityItemCard({
  item,
  showRoutingActions,
  onRoutingAsk,
  onAcceptProposal,
  onDiscardProposal,
  lockDeskActions,
  animateEntrance,
  entranceSettled,
  onEntranceComplete,
  showNext24h,
  showRealtime,
  planBusy,
  catchupActive,
  onNext24h,
  onRealtime,
  liveSellMznPerZar,
}: {
  item: ActivityItem
  showRoutingActions: boolean
  onRoutingAsk: (item: ActivityItem, message: string) => Promise<void>
  onAcceptProposal: (item: ActivityItem) => Promise<void>
  onDiscardProposal: (item: ActivityItem) => Promise<void>
  lockDeskActions?: boolean
  animateEntrance?: boolean
  entranceSettled?: boolean
  onEntranceComplete?: (id: string) => void
  showNext24h?: boolean
  showRealtime?: boolean
  planBusy?: boolean
  catchupActive?: boolean
  onNext24h?: () => void
  onRealtime?: () => void
  liveSellMznPerZar?: number | null
}) {
  const router = useRouter()
  const closeNotifications = useNotificationsStore((s) => s.closeNotifications)
  const profile = useUserProfileStore((s) => s.profile)
  const isCopied = isCopiedActivity(item)
  const deskSpeaker =
    item.thinking || item.kind === 'CONVERSION_ROUTING_INSTRUCTION'
      ? DESK_TEAM[deskAgentFor(item)]
      : null
  const avatarUrl = isCopied ? null : deskSpeaker?.avatar ?? resolveTaskAvatar(item)
  const showUserPlaceholder = isCopied || isUserPlaceholderAvatar(avatarUrl)
  const [downloadState, setDownloadState] = useState<'idle' | 'loading' | 'pressed'>('idle')
  const [confirmState, setConfirmState] = useState<'idle' | 'loading' | 'pressed'>('idle')
  const [proposalState, setProposalState] = useState<'idle' | 'accepting' | 'discarding'>('idle')
  const [startNextState, setStartNextState] = useState<'idle' | 'loading'>('idle')
  const actionsUnlocked = entranceSettled !== false
  const showDownload = actionsUnlocked && canDownloadProof(item)
  const showStartNextRun = actionsUnlocked && !lockDeskActions && item.startNextRun === true
  const showKycLink = actionsUnlocked && item.hasKycLink === true
  const isKycGate = isKycGateItem(item)
  const kycCta = item.kycAction === 'update' ? 'Update KYC' : 'Start KYC'
  const isRoutingInstruction = item.kind === 'CONVERSION_ROUTING_INSTRUCTION'
  const executedLabel =
    actionsUnlocked && isRoutingInstruction && item.status === 'completed' && !item.thinking
      ? executedPillLabel({ title: item.title, routingAction: item.routingAction })
      : null
  const showExecuted = Boolean(executedLabel)
  const confirmItem = showRoutingActions ? confirmTargetForCard(item) : null
  // Cash moves open the conversion keypad (desk closes first; keypad dismisses before bubbles resume).
  const showSendKeypad =
    Boolean(confirmItem) &&
    !lockDeskActions &&
    actionsUnlocked &&
    confirmItem?.routingAction === 'deploy' &&
    !isSequentialStepCard(confirmItem)
  const showRestockKeypad = !lockDeskActions && actionsUnlocked && isRestockKeypadCard(item)
  const showFundMznKeypad = !lockDeskActions && actionsUnlocked && isMznShortStepCard(item)
  const showProposalActions =
    !lockDeskActions &&
    actionsUnlocked &&
    item.routingAction === 'proposal' &&
    item.awaitingProposalAccept === true &&
    Boolean(item.proposalId)
  const askCard = isAskCard(item)
  const typing = animateEntrance === true
  const title = displayDeskTitle(item.title)
  const isRecycleCard =
    item.routingAction === 'replenish' || /^Step\s*5\b/i.test(title) || /^Restock ZAR\b/i.test(item.title || '')
  const isSendCard =
    item.routingAction === 'deploy' || /^Step\s*4\b/i.test(title) || /^Sell ZAR\b/i.test(item.title || '')
  const body = isRecycleCard
    ? enrichRecycleBodyWithLiveCost(item.body, liveSellMznPerZar, item.ticketPath)
    : isSendCard
      ? enrichSendBodyWithLiveSpread(item.body, liveSellMznPerZar, item.ticketSplits)
      : displayDeskBody(item.body)
  const [titleDone, setTitleDone] = useState(!typing || !title)
  useEffect(() => {
    setTitleDone(!typing || !title)
  }, [typing, item.id, title])
  const handleTitleTyped = useCallback(() => {
    setTitleDone(true)
    if (!body) onEntranceComplete?.(item.id)
  }, [body, item.id, onEntranceComplete])
  const handleBodyTyped = useCallback(() => {
    onEntranceComplete?.(item.id)
  }, [item.id, onEntranceComplete])

  const handleDownload = async (event: React.MouseEvent) => {
    event.stopPropagation()
    if (downloadState !== 'idle') return
    const invoiceId = item.invoiceId || (isInvoiceDownloadItem(item) ? item.txId : null)
    if (isInvoiceDownloadItem(item)) {
      if (!item.invoiceZipStoragePath && !invoiceId) return
    } else if (isPopPackDownloadItem(item)) {
      if (!item.proofZipStoragePath) return
    } else if (!item.txId) {
      return
    }
    setDownloadState('loading')
    const startedAt = Date.now()
    try {
      if (isInvoiceDownloadItem(item)) {
        if (item.invoiceZipStoragePath) {
          await downloadSettlementInvoice(item.invoicePackId || invoiceId || 'pack', {
            invoiceZipStoragePath: item.invoiceZipStoragePath,
            invoiceZipFilename: item.invoiceZipFilename,
          })
        } else if (invoiceId) {
          await downloadSettlementInvoice(invoiceId)
        } else {
          return
        }
      } else if (isPopPackDownloadItem(item) && item.proofZipStoragePath) {
        await downloadSettlementInvoice(item.txId || 'pop-pack', {
          proofZipStoragePath: item.proofZipStoragePath,
          proofZipFilename: item.proofZipFilename,
        })
      } else if (item.kind === 'MONTHLY_SETTLEMENT_STATEMENT') {
        await downloadMonthlySettlementProof(item.txId!)
      } else if (item.kind === 'WEEKLY_SETTLEMENT_STATEMENT') {
        await downloadWeeklySettlementProof(item.txId!)
      } else {
        await downloadConversionProof(item.txId!)
      }
      const remaining = 700 - (Date.now() - startedAt)
      if (remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, remaining))
      }
      setDownloadState('pressed')
      await new Promise((resolve) => setTimeout(resolve, 480))
    } catch (error) {
      console.error('[Activity] Failed to download proof:', error)
    } finally {
      setDownloadState('idle')
    }
  }

  const handleKycLink = (event: React.MouseEvent) => {
    event.stopPropagation()
    closeNotifications()
    router.push(item.routeOnTap || '/profile')
  }

  const handleKycCta = (event: React.MouseEvent) => {
    event.stopPropagation()
    void startDiditVerification()
  }

  const openSendZarKeypad = useCallback(() => {
    if (confirmState !== 'idle' || !confirmItem || confirmItem.routingAction !== 'deploy') return false
    if (isConversionInFlight() || useRoutingPlaybackStore.getState().play) return false
    const amountZAR = confirmItem.amount?.value
    const amountMZN = confirmItem.pairedAmountValue
    if (!(typeof amountZAR === 'number') || amountZAR <= 0) return false
    setConfirmState('loading')
    const opened = openDeskKeypad({
      destination: 'MZN',
      amountZAR,
      amountMZN: typeof amountMZN === 'number' ? amountMZN : 0,
      testRunId: confirmItem.testRunId,
      cycleNumber: confirmItem.cycleNumber,
      routingAction: 'deploy',
    })
    if (opened) markDeskKeypadOffered(confirmItem.id)
    window.setTimeout(() => setConfirmState('idle'), 400)
    return opened
  }, [confirmItem, confirmState])

  const openRestockKeypad = useCallback(() => {
    if (confirmState !== 'idle' || !isRestockKeypadCard(item)) return false
    if (isConversionInFlight() || useRoutingPlaybackStore.getState().play) return false
    const amountMZN = item.amount?.value
    const amountZAR = item.pairedAmountValue
    if (!(typeof amountMZN === 'number') || amountMZN <= 0) return false
    setConfirmState('loading')
    const opened = openDeskKeypad({
      destination: 'ZAR',
      amountZAR: typeof amountZAR === 'number' ? amountZAR : 0,
      amountMZN,
      testRunId: item.testRunId,
      cycleNumber: item.cycleNumber,
      routingAction: 'replenish',
    })
    if (opened) markDeskKeypadOffered(item.id)
    window.setTimeout(() => setConfirmState('idle'), 400)
    return opened
  }, [confirmState, item])

  const openFundMznKeypad = useCallback(() => {
    if (confirmState !== 'idle' || !isMznShortStepCard(item)) return false
    if (isConversionInFlight() || useRoutingPlaybackStore.getState().play) return false
    const amountMZN = item.amount?.value
    if (!(typeof amountMZN === 'number') || amountMZN <= 0) return false
    const amountZAR = typeof item.pairedAmountValue === 'number' ? item.pairedAmountValue : 0
    setConfirmState('loading')
    const opened = openDeskKeypad({
      destination: 'MZN',
      amountZAR,
      amountMZN,
      testRunId: item.testRunId,
      cycleNumber: item.cycleNumber,
      routingAction: 'mzn_fund',
    })
    if (opened) markDeskKeypadOffered(item.id)
    window.setTimeout(() => setConfirmState('idle'), 400)
    return opened
  }, [confirmState, item])

  const handleSendZarKeypad = (event: React.MouseEvent) => {
    event.stopPropagation()
    openSendZarKeypad()
  }

  const handleRestockKeypad = (event: React.MouseEvent) => {
    event.stopPropagation()
    openRestockKeypad()
  }

  const handleFundMznKeypad = (event: React.MouseEvent) => {
    event.stopPropagation()
    openFundMznKeypad()
  }

  // After the bubble finishes typing, pop the keypad once (live confirm or catch-up playback).
  useEffect(() => {
    if (planBusy || !actionsUnlocked || lockDeskActions) return
    // Desk restore mid-submit must not re-open the keypad (causes "already in progress").
    if (isConversionInFlight() || useRoutingPlaybackStore.getState().play) return
    const live =
      showSendKeypad || showRestockKeypad || showFundMznKeypad
    const catchupPlayback =
      catchupActive === true && !live && isCatchupKeypadCard(item)
    if (!live && !catchupPlayback) return
    const targetId = showSendKeypad ? confirmItem?.id || item.id : item.id
    const cycleKey = routingKeypadOfferKey(
      showSendKeypad && confirmItem
        ? {
            testRunId: confirmItem.testRunId,
            cycleNumber: confirmItem.cycleNumber,
            routingAction: confirmItem.routingAction === 'deploy' ? 'deploy' : undefined,
          }
        : {
            testRunId: item.testRunId,
            cycleNumber: item.cycleNumber,
            routingAction:
              item.routingAction === 'deploy' ||
              item.routingAction === 'replenish' ||
              item.routingAction === 'mzn_fund'
                ? item.routingAction
                : undefined,
          }
    )
    if (!targetId || wasDeskKeypadOffered(targetId) || wasDeskKeypadOffered(cycleKey)) return
    const timer = window.setTimeout(() => {
      if (isConversionInFlight() || useRoutingPlaybackStore.getState().play) return
      if (wasDeskKeypadOffered(targetId) || wasDeskKeypadOffered(cycleKey)) return
      const opened = showSendKeypad
        ? openSendZarKeypad()
        : showRestockKeypad
          ? openRestockKeypad()
          : showFundMznKeypad
            ? openFundMznKeypad()
            : catchupPlayback
              ? openCatchupPlaybackKeypad(item)
              : false
      if (opened) {
        markDeskKeypadOffered(targetId)
        markDeskKeypadOffered(cycleKey)
      }
    }, 320)
    return () => window.clearTimeout(timer)
  }, [
    actionsUnlocked,
    catchupActive,
    confirmItem,
    item,
    lockDeskActions,
    openFundMznKeypad,
    openRestockKeypad,
    openSendZarKeypad,
    planBusy,
    showFundMznKeypad,
    showRestockKeypad,
    showSendKeypad,
  ])

  const handleAcceptProposal = async (event: React.MouseEvent) => {
    event.stopPropagation()
    if (proposalState !== 'idle') return
    setProposalState('accepting')
    try {
      await onAcceptProposal(item)
    } finally {
      setProposalState('idle')
    }
  }

  const handleDiscardProposal = async (event: React.MouseEvent) => {
    event.stopPropagation()
    if (proposalState !== 'idle') return
    setProposalState('discarding')
    try {
      await onDiscardProposal(item)
    } finally {
      setProposalState('idle')
    }
  }

  const handleStartNextRun = async (event: React.MouseEvent) => {
    event.stopPropagation()
    if (startNextState !== 'idle') return
    setStartNextState('loading')
    try {
      await onRoutingAsk(item, 'start the next run')
    } finally {
      setStartNextState('idle')
    }
  }

  return (
    <article
      className={styles.activityItem}
      data-desk-item-at={item.createdAt}
      data-desk-item-cycle={typeof item.cycleNumber === 'number' ? item.cycleNumber : undefined}
    >
      <div className={styles.activityAvatar}>
        {showUserPlaceholder ? (
          <Avatar
            avatarUrl={isCopied ? profile.avatarUrl : null}
            name={item.actor.name || profile.fullName}
            handle={profile.userHandle}
            email={profile.email}
            size={36}
            rounded={18}
          />
        ) : (
          <Image
            src={avatarUrl ?? ADMIN_AVATAR_PATH}
            alt={deskSpeaker?.name || item.actor.name || 'Payment agent'}
            width={36}
            height={36}
            className={styles.avatarImg}
            unoptimized
          />
        )}
      </div>
      <div className={styles.activityContent}>
        {deskSpeaker ? (
          <div className={styles.activitySpeaker}>
            <span>{deskSpeaker.name}</span>
            <span className={styles.activitySpeakerRole}>{deskSpeaker.role}</span>
          </div>
        ) : null}
        <div className={styles.activityHeader}>
          {typing && title ? (
            <TypewriterText
              text={title}
              animate
              className={styles.activityTitle}
              figureClassName={styles.activityFigure}
              highlightFigures
              charsPerTick={5}
              tickMs={14}
              onComplete={handleTitleTyped}
            />
          ) : (
            <div className={styles.activityTitle}>
              {highlightDeskText(title, styles.activityFigure)}
            </div>
          )}
          <div className={styles.activityTime}>
            {item.kind === 'CONVERSION_ROUTING_INSTRUCTION'
              ? formatVisibleSast(item.createdAt)
              : formatRelativeShort(item.createdAt)}
          </div>
        </div>
        {item.thinking ? (
          <div className={styles.thinkingDots} aria-label="Thinking" aria-live="polite">
            <span />
            <span />
            <span />
          </div>
        ) : (
          <>
            {askCard && item.userReply ? (
              <div className={styles.activityUserReply}>
                <div className={styles.activityUserReplyLabel}>
                  <span>You</span>
                  {item.userRepliedAt ? (
                    <span className={styles.activityUserReplyTime}>{formatVisibleSast(item.userRepliedAt)}</span>
                  ) : null}
                </div>
                <div className={styles.activityUserReplyBody}>
                  {highlightDeskText(item.userReply, styles.activityFigure)}
                </div>
              </div>
            ) : null}
            {body && (!typing || titleDone) ? (
              <TypewriterText
                text={body}
                animate={typing}
                className={styles.activityBody}
                figureClassName={styles.activityFigure}
                highlightFigures
                charsPerTick={4}
                tickMs={16}
                onComplete={typing ? handleBodyTyped : undefined}
              />
            ) : typing && !body && titleDone ? (
              <TypewriterCompleteSignal onComplete={handleBodyTyped} />
            ) : null}
            {actionsUnlocked ? <DeskCardVisuals item={item} /> : null}
            {!askCard && item.userReply && actionsUnlocked ? (
              <div className={styles.activityUserReply}>
                <div className={styles.activityUserReplyLabel}>
                  <span>You</span>
                  {item.userRepliedAt ? (
                    <span className={styles.activityUserReplyTime}>{formatVisibleSast(item.userRepliedAt)}</span>
                  ) : null}
                </div>
                <div className={styles.activityUserReplyBody}>
                  {highlightDeskText(item.userReply, styles.activityFigure)}
                </div>
              </div>
            ) : null}
          </>
        )}
        {(isKycGate ||
          showSendKeypad ||
          showRestockKeypad ||
          showFundMznKeypad ||
          showStartNextRun ||
          showDownload ||
          showProposalActions ||
          showExecuted ||
          showKycLink ||
          showNext24h ||
          showRealtime) && (
          <div className={styles.activityActionRow}>
            {isKycGate && (
              <button
                type="button"
                className={styles.confirmButton}
                aria-label={kycCta}
                onClick={handleKycCta}
              >
                {kycCta}
              </button>
            )}
            {showFundMznKeypad && (
              <button
                type="button"
                className={[
                  styles.confirmButton,
                  confirmState === 'loading' ? styles.confirmButtonLoading : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-label="Open keypad to fund MZN cover"
                aria-busy={confirmState !== 'idle'}
                disabled={confirmState !== 'idle' || planBusy === true}
                onClick={handleFundMznKeypad}
              >
                Fund MZN
              </button>
            )}
            {showSendKeypad && (
              <button
                type="button"
                className={[
                  styles.confirmButton,
                  confirmState === 'loading' ? styles.confirmButtonLoading : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-label="Open keypad to send ZAR"
                aria-busy={confirmState !== 'idle'}
                disabled={confirmState !== 'idle' || planBusy === true}
                onClick={handleSendZarKeypad}
              >
                Send ZAR
              </button>
            )}
            {showRestockKeypad && (
              <button
                type="button"
                className={[
                  styles.confirmButton,
                  confirmState === 'loading' ? styles.confirmButtonLoading : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-label="Open keypad to restock at COST"
                aria-busy={confirmState !== 'idle'}
                disabled={confirmState !== 'idle' || planBusy === true}
                onClick={handleRestockKeypad}
              >
                Restock
              </button>
            )}
            {showStartNextRun && (
              <button
                type="button"
                className={[
                  styles.confirmButton,
                  startNextState === 'loading' ? styles.confirmButtonLoading : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-label="Start the window"
                aria-busy={startNextState !== 'idle'}
                disabled={startNextState !== 'idle'}
                onClick={handleStartNextRun}
              >
                Start the window
              </button>
            )}
            {showProposalActions && (
              <>
                <button
                  type="button"
                  className={[
                    styles.confirmButton,
                    proposalState === 'accepting' ? styles.confirmButtonLoading : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-label={item.pursueLabel || 'Accept routing proposal'}
                  disabled={proposalState !== 'idle'}
                  onClick={handleAcceptProposal}
                >
                  <Check size={16} strokeWidth={2.4} />
                  {item.pursueLabel || 'Accept'}
                </button>
                <button
                  type="button"
                  className={styles.replyButton}
                  aria-label="Discard routing proposal"
                  disabled={proposalState !== 'idle'}
                  onClick={handleDiscardProposal}
                >
                  Discard
                </button>
              </>
            )}
            {showNext24h && (
              <button
                type="button"
                className={[styles.replyButton, planBusy ? styles.confirmButtonLoading : '']
                  .filter(Boolean)
                  .join(' ')}
                aria-label="Simulate the next 24 hours on the desk"
                aria-busy={planBusy === true}
                disabled={planBusy === true || confirmState !== 'idle'}
                onClick={(event) => {
                  event.stopPropagation()
                  onNext24h?.()
                }}
              >
                Next 24h
              </button>
            )}
            {showRealtime && (
              <button
                type="button"
                className={[styles.replyButton, planBusy ? styles.confirmButtonLoading : '']
                  .filter(Boolean)
                  .join(' ')}
                aria-label="Return to the live desk clock"
                aria-busy={planBusy === true}
                disabled={planBusy === true}
                onClick={(event) => {
                  event.stopPropagation()
                  onRealtime?.()
                }}
              >
                Real time
              </button>
            )}
            {showDownload && (
              <button
                type="button"
                className={[
                  styles.replyButton,
                  downloadState === 'loading' ? styles.confirmButtonLoading : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-label={
                  isInvoiceDownloadItem(item)
                    ? 'Download invoices'
                    : isPopPackDownloadItem(item)
                      ? 'Download proofs of payment'
                      : item.kind === 'MONTHLY_SETTLEMENT_STATEMENT'
                        ? 'Download monthly settlement statement'
                        : item.kind === 'WEEKLY_SETTLEMENT_STATEMENT'
                          ? 'Download weekly settlement statement'
                          : 'Download proof of payment'
                }
                aria-busy={downloadState !== 'idle'}
                disabled={downloadState !== 'idle'}
                onClick={handleDownload}
              >
                <Download size={14} strokeWidth={2.4} />
                {isInvoiceDownloadItem(item)
                  ? item.invoiceZipStoragePath
                    ? 'Download invoices'
                    : 'Download invoice'
                  : isPopPackDownloadItem(item)
                    ? 'Download POPs'
                    : 'Download POP'}
              </button>
            )}
            {showExecuted && executedLabel && (
              <span className={styles.executedLabel}>
                <Check size={16} strokeWidth={2.4} />
                {executedLabel}
              </span>
            )}
            {showKycLink && (
              <button
                type="button"
                className={styles.replyButton}
                aria-label="Update KYC documents"
                onClick={handleKycLink}
              >
                <ExternalLink size={14} strokeWidth={2.4} />
                Update KYC
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  )
}

function ThinkingPlaceholder({ speaker }: { speaker?: (typeof DESK_TEAM)[keyof typeof DESK_TEAM] | null }) {
  const who = speaker || DESK_TEAM.sam
  return (
    <article className={styles.activityItem} aria-live="polite">
      <div className={styles.activityAvatar}>
        <Image src={who.avatar} alt={who.name} width={36} height={36} className={styles.avatarImg} unoptimized />
      </div>
      <div className={styles.activityContent}>
        <div className={styles.activitySpeaker}>
          <span>{who.name}</span>
          <span className={styles.activitySpeakerRole}>{who.role}</span>
        </div>
        <div className={styles.thinkingDots} aria-label="Writing">
          <span />
          <span />
          <span />
        </div>
      </div>
    </article>
  )
}

function ActivitySection({
  title,
  items,
  latestAwaitingId,
  latestActivityId,
  onRoutingAsk,
  onAcceptProposal,
  onDiscardProposal,
  lockDeskActions,
  visibleIds,
  typingId,
  isSettled,
  onEntranceComplete,
  planMode,
  planBusy,
  catchupActive,
  onNext24h,
  onRealtime,
  liveSellMznPerZar,
}: {
  title: string
  items: ActivityItem[]
  latestAwaitingId: string | null
  latestActivityId: string | null
  onRoutingAsk: (item: ActivityItem, message: string) => Promise<void>
  onAcceptProposal: (item: ActivityItem) => Promise<void>
  onDiscardProposal: (item: ActivityItem) => Promise<void>
  lockDeskActions?: boolean
  visibleIds: Set<string>
  typingId: string | null
  isSettled: (id: string) => boolean
  onEntranceComplete: (id: string) => void
  planMode: 'live' | 'planned'
  planBusy: boolean
  catchupActive: boolean
  onNext24h: () => void
  onRealtime: () => void
  liveSellMznPerZar?: number | null
}) {
  const visibleItems = items.filter((item) => item.thinking === true || visibleIds.has(item.id))
  if (visibleItems.length === 0) return null

  return (
    <div className={styles.activitySection}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <div className={styles.activityList}>
        {visibleItems.map((item) => {
          const settled = item.thinking === true || isSettled(item.id)
          // Plan pills ride the open step card when one exists; else the latest bubble.
          // Do not wait on typewriter settle — that was dropping Real time mid-reveal.
          const planHostId = latestAwaitingId || latestActivityId
          const isPlanHost = Boolean(planHostId) && item.id === planHostId && item.thinking !== true
          return (
            <ActivityItemCard
              key={item.id}
              item={item}
              showRoutingActions={!lockDeskActions && item.id === latestAwaitingId && settled}
              onRoutingAsk={onRoutingAsk}
              onAcceptProposal={onAcceptProposal}
              onDiscardProposal={onDiscardProposal}
              lockDeskActions={lockDeskActions}
              animateEntrance={item.id === typingId}
              entranceSettled={settled}
              onEntranceComplete={onEntranceComplete}
              showNext24h={!lockDeskActions && isPlanHost}
              showRealtime={!lockDeskActions && isPlanHost && planMode === 'planned'}
              planBusy={planBusy}
              catchupActive={catchupActive}
              onNext24h={onNext24h}
              onRealtime={onRealtime}
              liveSellMznPerZar={liveSellMznPerZar}
            />
          )
        })}
      </div>
    </div>
  )
}

export function NotificationsList({ searchQuery = '' }: { searchQuery?: string }) {
  const clear = useActivityStore((s) => s.clear)
  const all = useActivityStore((s) => s.all)
  const isAuthed = useAuthStore((s) => s.isAuthed)
  const { rates: fxRates } = useFxRates(['MZN'], { refreshMs: 30_000 })
  const liveSellMznPerZar =
    typeof fxRates?.rates?.MZN === 'number' && fxRates.rates.MZN > 0 ? fxRates.rates.MZN : null
  const { deskBlocked, kycCta } = useSignedInKycAccess()
  const [remoteItems, setRemoteItems] = useState<ActivityItem[]>([])
  const [thinkingItem, setThinkingItem] = useState<ActivityItem | null>(null)
  const [visibleCount, setVisibleCount] = useState(ACTIVITY_PAGE_SIZE)
  const [askText, setAskText] = useState('')
  const [askState, setAskState] = useState<'idle' | 'loading'>('idle')
  const [askError, setAskError] = useState('')
  
  // Runtime validator: auto-clear bad data
  useEffect(() => {
    const items = all()
    const hasBadItems =
      !Array.isArray(items) ||
      items.some((it) => !it || typeof it.id !== 'string' || !Number.isFinite(it.createdAt))
    
    if (hasBadItems) {
      clear()
    }
  }, [all, clear])

  useEffect(() => {
    if (!isAuthed) {
      setRemoteItems([])
      setThinkingItem(null)
      return
    }
    const unsubscribe = subscribeToActivityEvents(setRemoteItems)
    return () => {
      unsubscribe()
    }
  }, [isAuthed])

  useEffect(() => {
    if (!deskBlocked) return
    prefetchDiditSdk()
  }, [deskBlocked])

  useEffect(() => {
    if (!thinkingItem) return
    const arrived = remoteItems.some(
      (item) =>
        item.kind === 'CONVERSION_ROUTING_INSTRUCTION' &&
        item.thinking !== true &&
        item.createdAt >= thinkingItem.createdAt - 2500
    )
    if (arrived) setThinkingItem(null)
  }, [remoteItems, thinkingItem])
  
  const localItems = useActivityStore((s) => s.all())
  const allItems = useMemo(() => {
    const remoteIds = new Set(remoteItems.map((item) => item.id))
    const merged = [
      ...(thinkingItem ? [thinkingItem] : []),
      ...remoteItems,
      ...localItems.filter((item) => !remoteIds.has(item.id) && item.id !== thinkingItem?.id),
    ]
    return merged.sort((a, b) => b.createdAt - a.createdAt)
  }, [localItems, remoteItems, thinkingItem])
  const setActiveAgent = useDeskSpeakerStore((s) => s.setActive)
  useEffect(() => {
    setActiveAgent(activeDeskAgent(allItems))
  }, [allItems, setActiveAgent])
  const kycGateStampRef = useRef(Date.now())
  const filteredItems = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    const items = allItems.filter((item) => {
      if (item.id === KYC_GATE_ID) return false
      if (item.thinking) return !normalizedQuery || searchableText(item).includes(normalizedQuery)
      if (!isPaymentActivity(item)) return false
      return !normalizedQuery || searchableText(item).includes(normalizedQuery)
    })
    if (!deskBlocked) return items
    return [buildKycGateItem(kycCta, kycGateStampRef.current), ...items]
  }, [allItems, searchQuery, deskBlocked, kycCta])
  useEffect(() => {
    setVisibleCount(ACTIVITY_PAGE_SIZE)
  }, [searchQuery])
  const isSearching = searchQuery.trim().length > 0
  const catchupCount = useMemo(() => {
    const cutoff = Date.now() - DESK_CATCHUP_MS
    return filteredItems.filter(
      (item) => item.thinking !== true && item.id !== KYC_GATE_ID && (item.createdAt || 0) >= cutoff
    ).length
  }, [filteredItems])
  const pagedItems = useMemo(() => {
    const windowSize = isSearching ? filteredItems.length : Math.max(visibleCount, catchupCount)
    const newestWindow = filteredItems.slice(0, windowSize)
    return [...newestWindow].sort((a, b) => a.createdAt - b.createdAt)
  }, [filteredItems, isSearching, visibleCount, catchupCount])
  const hasMore = !isSearching && Math.max(visibleCount, catchupCount) < filteredItems.length
  const listRootRef = useRef<HTMLDivElement>(null)
  const skipScrollRef = useRef(false)
  const latestAwaitingId = useMemo(
    () => (deskBlocked ? null : latestAwaitingRoutingId(allItems)),
    [allItems, deskBlocked]
  )
  const latestActivityId = useMemo(() => {
    if (deskBlocked) return KYC_GATE_ID
    return filteredItems.find((item) => item.thinking !== true)?.id ?? null
  }, [filteredItems, deskBlocked])

  const revealItems = useMemo(
    () =>
      pagedItems
        .filter((item) => item.thinking !== true && item.id !== KYC_GATE_ID)
        .map((item) => ({ id: item.id, createdAt: item.createdAt })),
    [pagedItems]
  )
  const reveal = useProgressiveReveal(revealItems)
  const setDeskFocus = useDeskFocusStore((s) => s.setFocus)
  const planMode = useDeskPlanStore((s) => s.mode)
  const planBusy = useDeskPlanStore((s) => s.busy)
  const applyPlanSummary = useDeskPlanStore((s) => s.applySummary)
  const setPlanBusy = useDeskPlanStore((s) => s.setBusy)
  const nextRevealSpeaker = useMemo(() => {
    if (!reveal.showDots) return null
    const pending = pagedItems.find((item) => !reveal.visibleIds.has(item.id) && item.thinking !== true)
    return pending ? DESK_TEAM[deskAgentFor(pending)] : DESK_TEAM.sam
  }, [pagedItems, reveal.showDots, reveal.visibleIds])

  const applyFocusFromItem = useCallback(
    (item: ActivityItem | null | undefined) => {
      if (!item) return
      setDeskFocus(item.createdAt, typeof item.cycleNumber === 'number' ? item.cycleNumber : null)
    },
    [setDeskFocus]
  )

  // Replay: header date/progress track the bubble currently typing or about to appear.
  useEffect(() => {
    if (reveal.typingId) {
      applyFocusFromItem(pagedItems.find((item) => item.id === reveal.typingId))
      return
    }
    if (reveal.showDots) {
      const pending = pagedItems.find((item) => !reveal.visibleIds.has(item.id) && item.thinking !== true)
      applyFocusFromItem(pending)
    }
  }, [applyFocusFromItem, pagedItems, reveal.showDots, reveal.typingId, reveal.visibleIds])

  // Settled + manual scroll: pick the bubble nearest the lower focus line of the feed.
  useEffect(() => {
    const feed = listRootRef.current?.closest('[data-desk-feed]')
    if (!(feed instanceof HTMLElement)) return

    let frame = 0
    const syncFromScroll = () => {
      if (reveal.typingId || reveal.showDots) return
      const nodes = feed.querySelectorAll<HTMLElement>('[data-desk-item-at]')
      if (!nodes.length) return
      const feedRect = feed.getBoundingClientRect()
      const focusY = feedRect.top + feed.clientHeight * 0.72
      let bestAt: number | null = null
      let bestCycle: number | null = null
      let bestDist = Number.POSITIVE_INFINITY
      nodes.forEach((node) => {
        const rect = node.getBoundingClientRect()
        const mid = rect.top + rect.height / 2
        const dist = Math.abs(mid - focusY)
        if (dist >= bestDist) return
        const at = Number(node.getAttribute('data-desk-item-at'))
        if (!Number.isFinite(at)) return
        const cycleRaw = node.getAttribute('data-desk-item-cycle')
        const cycle = cycleRaw ? Number(cycleRaw) : NaN
        bestDist = dist
        bestAt = at
        bestCycle = Number.isFinite(cycle) && cycle > 0 ? cycle : null
      })
      if (bestAt != null) setDeskFocus(bestAt, bestCycle)
    }

    const onScroll = () => {
      if (frame) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(syncFromScroll)
    }
    feed.addEventListener('scroll', onScroll, { passive: true })
    syncFromScroll()
    return () => {
      feed.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [pagedItems.length, reveal.showDots, reveal.typingId, setDeskFocus])

  useEffect(() => {
    if (skipScrollRef.current) {
      skipScrollRef.current = false
      return
    }
    const feed = listRootRef.current?.closest('[data-desk-feed]')
    if (!(feed instanceof HTMLElement)) return
    feed.scrollTop = feed.scrollHeight
  }, [latestActivityId, thinkingItem?.id, pagedItems.length, reveal.typingId, reveal.showDots])

  const { today, yesterday, last7Days, last30Days, older } = useMemo(
    () => groupByTimePeriod(pagedItems),
    [pagedItems]
  )

  const handleRoutingAsk = async (source: ActivityItem, message: string) => {
    if (deskBlocked || isKycGateItem(source)) {
      throw new Error('Complete KYC before continuing.')
    }
    const routing =
      allItems.find(isAwaitingRoutingItem) ||
      allItems.find((item) => Boolean(item.testRunId) && item.thinking !== true)
    const testRunId = source.testRunId || routing?.testRunId
    const cycleNumber = source.cycleNumber || routing?.cycleNumber
    const speaker = addressedDeskAgent(message)
    const who = DESK_TEAM[speaker]
    setThinkingItem({
      id: `thinking-ask-${Date.now()}`,
      kind: 'CONVERSION_ROUTING_INSTRUCTION',
      actor: {
        type: 'ai',
        name: who.name,
        avatarUrl: who.avatar,
      },
      deskSpeaker: speaker,
      title: source.title,
      thinking: true,
      createdAt: Date.now(),
      cycleNumber,
      testRunId,
      awaitingConfirm: false,
      routingAction: 'advice',
      avatarKind: 'convert_zar',
    })
    try {
      await admin_submitConversionRoutingFeedback({
        message,
        testRunId,
        cycleNumber,
        cardCount: 5,
        machineCount: 4,
        assignments: parseRoutingAssignmentsFromBody(source.body || routing?.body),
      })
    } catch (error) {
      setThinkingItem(null)
      throw error
    }
  }

  const handleAcceptProposal = async (item: ActivityItem) => {
    if (deskBlocked) return
    if (!item.proposalId) return
    setThinkingItem({
      id: `thinking-accept-${item.proposalId}`,
      kind: 'CONVERSION_ROUTING_INSTRUCTION',
      actor: {
        type: 'ai',
        name: DESK_TEAM.sam.name,
        avatarUrl: DESK_TEAM.sam.avatar,
      },
      title: item.title,
      thinking: true,
      createdAt: Date.now(),
      cycleNumber: item.cycleNumber,
      testRunId: item.testRunId,
      awaitingConfirm: false,
      routingAction: 'advice',
      avatarKind: 'convert_zar',
    })
    try {
      await admin_submitConversionRoutingFeedback({
        acceptProposalId: item.proposalId,
        testRunId: item.testRunId,
        cycleNumber: item.cycleNumber,
      })
    } catch (error) {
      setThinkingItem(null)
      throw error
    }
  }

  const handleDiscardProposal = async (item: ActivityItem) => {
    if (!item.proposalId) return
    await admin_submitConversionRoutingFeedback({
      discardProposalId: item.proposalId,
      testRunId: item.testRunId,
      cycleNumber: item.cycleNumber,
    })
  }

  const handleNext24h = async () => {
    if (deskBlocked || planBusy) return
    setPlanBusy(true)
    try {
      const summary = await admin_simulateNextDeskDay()
      applyPlanSummary(summary)
      if (typeof summary.plannedClockMs === 'number' && summary.plannedClockMs > 0) {
        setDeskFocus(summary.plannedClockMs, typeof summary.cycleNumber === 'number' ? summary.cycleNumber : null)
      }
      // Landed on Send/Restock (or already there): pop the keypad so Next 24h is not a no-op.
      const gate = summary.awaitingKeypad
      if (gate === 'send' || gate === 'restock') {
        const amountZAR = Number(summary.keypadAmountZar || 0)
        const amountMZN = Number(summary.keypadAmountMzn || 0)
        if (gate === 'send' && amountZAR > 0) {
          openDeskKeypad({
            destination: 'MZN',
            amountZAR,
            amountMZN,
            testRunId: summary.testRunId,
            cycleNumber: summary.cycleNumber,
            routingAction: 'deploy',
          })
        } else if (gate === 'restock' && amountMZN > 0) {
          openDeskKeypad({
            destination: 'ZAR',
            amountZAR,
            amountMZN,
            testRunId: summary.testRunId,
            cycleNumber: summary.cycleNumber,
            routingAction: 'replenish',
          })
        }
      }
    } catch (error) {
      console.error('[Activity] Next 24h failed:', error)
    } finally {
      setPlanBusy(false)
    }
  }

  const handleRealtime = async () => {
    if (planBusy) return
    setPlanBusy(true)
    try {
      const summary = await admin_exitDeskPlan()
      applyPlanSummary(summary)
    } catch (error) {
      console.error('[Activity] Real time exit failed:', error)
      useDeskPlanStore.getState().setLive()
    } finally {
      setPlanBusy(false)
    }
  }

  const sectionProps = {
    latestAwaitingId,
    latestActivityId,
    onRoutingAsk: handleRoutingAsk,
    onAcceptProposal: handleAcceptProposal,
    onDiscardProposal: handleDiscardProposal,
    lockDeskActions: deskBlocked,
    visibleIds: reveal.visibleIds,
    typingId: reveal.typingId,
    isSettled: reveal.isSettled,
    onEntranceComplete: reveal.onTypingComplete,
    planMode,
    planBusy,
    catchupActive: reveal.catchupActive,
    onNext24h: () => void handleNext24h(),
    onRealtime: () => void handleRealtime(),
    liveSellMznPerZar,
  }

  const askAnchor =
    allItems.find((item) => item.thinking !== true && item.id === latestActivityId) ||
    allItems.find((item) => item.thinking !== true && Boolean(item.testRunId)) ||
    allItems.find((item) => item.thinking !== true)

  const handleSubmitAsk = async (event?: { preventDefault: () => void }) => {
    event?.preventDefault()
    const message = askText.trim()
    if (!message || askState !== 'idle' || deskBlocked || !askAnchor) return
    setAskState('loading')
    setAskError('')
    try {
      await handleRoutingAsk(askAnchor, message)
      setAskText('')
    } catch (error) {
      setAskError(error instanceof Error ? error.message : 'Sam could not take that just now.')
    } finally {
      setAskState('idle')
    }
  }

  return (
    <>
      <div className={listStyles.conversationList} data-desk-feed>
        <div className={`${styles.activityContainer} ${styles.deskFeed}`} ref={listRootRef}>
          {hasMore && (
            <div className={styles.activityList}>
              <button
                type="button"
                className={styles.moreButton}
                onClick={() => {
                  skipScrollRef.current = true
                  setVisibleCount((count) => count + ACTIVITY_PAGE_SIZE)
                }}
              >
                Older
              </button>
            </div>
          )}
          <ActivitySection title="Older" items={older} {...sectionProps} />
          <ActivitySection title="Last 30 days" items={last30Days} {...sectionProps} />
          <ActivitySection title="Last 7 days" items={last7Days} {...sectionProps} />
          <ActivitySection title="Yesterday" items={yesterday} {...sectionProps} />
          <ActivitySection title="Today" items={today} {...sectionProps} />
          {reveal.showDots && !thinkingItem ? (
            <div className={styles.activityList}>
              <ThinkingPlaceholder speaker={nextRevealSpeaker} />
            </div>
          ) : null}
          {filteredItems.length === 0 && (
            <p className={styles.emptyState}>
              {searchQuery.trim() ? 'No matching payment activity.' : 'No payment activity yet.'}
            </p>
          )}
        </div>
      </div>
      <form className={listStyles.deskAskDock} onSubmit={handleSubmitAsk}>
        <div className={styles.replyFrame}>
          <textarea
            className={styles.replyInput}
            rows={3}
            value={askText}
            placeholder="Ask Sam"
            disabled={askState !== 'idle' || deskBlocked}
            onChange={(event) => setAskText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void handleSubmitAsk(event)
              }
            }}
          />
          <button
            type="submit"
            className={styles.replySend}
            disabled={askState !== 'idle' || deskBlocked || !askText.trim()}
            aria-label="Send"
          >
            <ArrowUp size={16} strokeWidth={2.4} />
          </button>
        </div>
        {askError ? <p className={styles.replyError}>{askError}</p> : null}
      </form>
    </>
  )
}

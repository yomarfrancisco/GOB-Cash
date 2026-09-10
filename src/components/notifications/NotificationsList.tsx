'use client'

import { useMemo, useEffect, useState } from 'react'
import Image from 'next/image'
import { Check, Download, ExternalLink, ArrowUp } from 'lucide-react'
import { useActivityStore, type ActivityItem } from '@/store/activity'
import { subscribeToActivityEvents } from '@/lib/activity/activityEvents'
import {
  downloadConversionProof,
  downloadMonthlySettlementProof,
  downloadWeeklySettlementProof,
  admin_submitConversionRoutingFeedback,
} from '@/lib/transactions/clientFunctions'
import { useRoutingPlaybackStore } from '@/store/routingPlayback'
import { useAuthStore } from '@/store/auth'
import { formatRelativeShort } from '@/lib/formatRelativeTime'
import { formatVisibleSast } from '@/lib/routing/routingTime'
import { parseRoutingAssignmentsFromBody } from '@/lib/routing/interpretAdminFeedback'
import { conversionAvatar, TASK_AVATARS } from '@/lib/activity/taskAvatars'
import { isUserPlaceholderAvatar, MOZPAGA_ADMIN_AVATAR, USER_PLACEHOLDER_AVATAR } from '@/lib/notifications/identityResolver'
import { useUserProfileStore } from '@/store/userProfile'
import Avatar from '@/components/Avatar'
import { useNotificationsStore } from '@/state/notifications'
import { useRouter } from 'next/navigation'
import styles from '@/app/activity/activity.module.css'

const ADMIN_AVATAR_PATH = MOZPAGA_ADMIN_AVATAR
const ACTIVITY_PAGE_SIZE = 16

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

function isPaymentActivity(item: ActivityItem): boolean {
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

function resolveTaskAvatar(item: ActivityItem): string {
  if (item.actor.avatarUrl && !isUserPlaceholderAvatar(item.actor.avatarUrl)) {
    return item.actor.avatarUrl
  }
  if (isWelcomeSignIn(item)) return ADMIN_AVATAR_PATH
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
      return item.avatarKind === 'convert_mzn' || item.routingAction === 'replenish'
        ? TASK_AVATARS.convertMzn
        : TASK_AVATARS.convertZar
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

function canDownloadProof(item: ActivityItem): boolean {
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

function isAskCard(item: ActivityItem): boolean {
  return item.routingAction === 'advice' || item.routingAction === 'proposal'
}

function latestAwaitingRoutingId(items: ActivityItem[]): string | null {
  return items.find(isAwaitingRoutingItem)?.id ?? null
}

function ActivityItemCard({
  item,
  showRoutingActions,
  showAsk,
  onRoutingAsk,
  onAcceptProposal,
  onDiscardProposal,
}: {
  item: ActivityItem
  showRoutingActions: boolean
  showAsk: boolean
  onRoutingAsk: (item: ActivityItem, message: string) => Promise<void>
  onAcceptProposal: (item: ActivityItem) => Promise<void>
  onDiscardProposal: (item: ActivityItem) => Promise<void>
}) {
  const router = useRouter()
  const closeNotifications = useNotificationsStore((s) => s.closeNotifications)
  const profile = useUserProfileStore((s) => s.profile)
  const isCopied = isCopiedActivity(item)
  const avatarUrl = isCopied ? null : resolveTaskAvatar(item)
  const showUserPlaceholder = isCopied || isUserPlaceholderAvatar(avatarUrl)
  const [downloadState, setDownloadState] = useState<'idle' | 'loading' | 'pressed'>('idle')
  const [confirmState, setConfirmState] = useState<'idle' | 'loading' | 'pressed'>('idle')
  const [proposalState, setProposalState] = useState<'idle' | 'accepting' | 'discarding'>('idle')
  const [askOpen, setAskOpen] = useState(false)
  const [askText, setAskText] = useState('')
  const [askState, setAskState] = useState<'idle' | 'loading'>('idle')
  const [askError, setAskError] = useState('')
  const showDownload = canDownloadProof(item)
  const showKycLink = item.hasKycLink === true
  const isRoutingInstruction = item.kind === 'CONVERSION_ROUTING_INSTRUCTION'
  const isAwaitingRouting = showRoutingActions && isAwaitingRoutingItem(item)
  const showConfirm = isAwaitingRouting && item.routingBlocked !== true
  const showProposalActions =
    item.routingAction === 'proposal' && item.awaitingProposalAccept === true && Boolean(item.proposalId)
  const askCard = isAskCard(item)

  const handleDownload = async (event: React.MouseEvent) => {
    event.stopPropagation()
    if (!item.txId || downloadState !== 'idle') return
    setDownloadState('loading')
    const startedAt = Date.now()
    try {
      if (item.kind === 'MONTHLY_SETTLEMENT_STATEMENT') {
        await downloadMonthlySettlementProof(item.txId)
      } else if (item.kind === 'WEEKLY_SETTLEMENT_STATEMENT') {
        await downloadWeeklySettlementProof(item.txId)
      } else {
        await downloadConversionProof(item.txId)
      }
      const remaining = 700 - (Date.now() - startedAt)
      if (remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, remaining))
      }
      setDownloadState('pressed')
      await new Promise((resolve) => setTimeout(resolve, 480))
    } catch (error) {
      console.error('[Activity] Failed to download proof of payment:', error)
    } finally {
      setDownloadState('idle')
    }
  }

  const handleKycLink = (event: React.MouseEvent) => {
    event.stopPropagation()
    closeNotifications()
    router.push(item.routeOnTap || '/profile')
  }

  const handleExecuteRouting = (event: React.MouseEvent) => {
    event.stopPropagation()
    if (confirmState !== 'idle') return
    const isReplenish = item.routingAction === 'replenish'
    const amountZAR = isReplenish ? item.pairedAmountValue : item.amount?.value
    const amountMZN = isReplenish ? item.amount?.value : item.pairedAmountValue
    if (isReplenish) {
      if (!(typeof amountMZN === 'number') || amountMZN <= 0) return
    } else if (!(typeof amountZAR === 'number') || amountZAR <= 0) {
      return
    }
    setConfirmState('loading')
    closeNotifications()
    useRoutingPlaybackStore.getState().requestPlay({
      destination: isReplenish ? 'ZAR' : 'MZN',
      amountZAR: amountZAR || 0,
      amountMZN: amountMZN || 0,
      testRunId: item.testRunId,
      cycleNumber: item.cycleNumber,
      routingAction: isReplenish ? 'replenish' : 'deploy',
    })
  }

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

  const handleToggleAsk = (event: React.MouseEvent) => {
    event.stopPropagation()
    setAskError('')
    setAskOpen((open) => !open)
  }

  const handleSubmitAsk = async (event: React.FormEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const message = askText.trim()
    if (!message || askState !== 'idle') return
    setAskState('loading')
    setAskError('')
    setAskOpen(false)
    try {
      await onRoutingAsk(item, message)
      setAskText('')
    } catch (error) {
      setAskOpen(true)
      setAskError(error instanceof Error ? error.message : 'Could not send that')
    } finally {
      setAskState('idle')
    }
  }

  return (
    <article className={styles.activityItem}>
      <div className={styles.activityAvatar}>
        {showUserPlaceholder ? (
          <Avatar
            avatarUrl={isCopied ? profile.avatarUrl : null}
            name={item.actor.name || profile.fullName}
            handle={profile.userHandle}
            email={profile.email}
            size={40}
            rounded={20}
          />
        ) : (
          <Image
            src={avatarUrl ?? ADMIN_AVATAR_PATH}
            alt={item.actor.name || 'Payment agent'}
            width={40}
            height={40}
            className={styles.avatarImg}
            unoptimized
          />
        )}
      </div>
      <div className={styles.activityContent}>
        <div className={styles.activityHeader}>
          <div className={styles.activityTitle}>{item.title}</div>
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
                <div className={styles.activityUserReplyBody}>{item.userReply}</div>
              </div>
            ) : null}
            {item.body ? <div className={styles.activityBody}>{item.body}</div> : null}
            {!askCard && item.userReply ? (
              <div className={styles.activityUserReply}>
                <div className={styles.activityUserReplyLabel}>
                  <span>You</span>
                  {item.userRepliedAt ? (
                    <span className={styles.activityUserReplyTime}>{formatVisibleSast(item.userRepliedAt)}</span>
                  ) : null}
                </div>
                <div className={styles.activityUserReplyBody}>{item.userReply}</div>
              </div>
            ) : null}
          </>
        )}
        {showDownload && (
          <button
            type="button"
            className={[
              styles.downloadButton,
              downloadState === 'loading' ? styles.downloadButtonLoading : '',
              downloadState === 'pressed' ? styles.downloadButtonPressed : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-label={
              item.kind === 'MONTHLY_SETTLEMENT_STATEMENT'
                ? 'Download monthly settlement statement'
                : item.kind === 'WEEKLY_SETTLEMENT_STATEMENT'
                  ? 'Download weekly settlement statement'
                  : 'Download proof of payment'
            }
            aria-busy={downloadState !== 'idle'}
            disabled={downloadState !== 'idle'}
            onClick={handleDownload}
          >
            <span className={styles.downloadFill} aria-hidden />
            <Download size={18} strokeWidth={2} />
          </button>
        )}
        {showConfirm && (
          <div className={styles.activityActionRow}>
            <button
              type="button"
              className={[
                styles.confirmButton,
                confirmState === 'loading' ? styles.confirmButtonLoading : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-label="Execute conversion cycle"
              aria-busy={confirmState !== 'idle'}
              disabled={confirmState !== 'idle'}
              onClick={handleExecuteRouting}
            >
              <Check size={16} strokeWidth={2.4} />
              Execute
            </button>
            {showAsk && (
              <button
                type="button"
                className={`${styles.replyButton} ${styles.askButton}`}
                aria-label="Ask about conversion instruction"
                aria-expanded={askOpen}
                onClick={handleToggleAsk}
              >
                Ask
              </button>
            )}
          </div>
        )}
        {!showConfirm && showAsk && (
          <div className={styles.activityActionRow}>
            <button
              type="button"
              className={`${styles.replyButton} ${styles.askButton}`}
              aria-label="Ask about conversion instruction"
              aria-expanded={askOpen}
              onClick={handleToggleAsk}
            >
              Ask
            </button>
          </div>
        )}
        {showAsk && askOpen && (
          <form className={styles.replyComposer} onSubmit={handleSubmitAsk} onClick={(event) => event.stopPropagation()}>
            <div className={styles.replyFrame}>
              <textarea
                className={styles.replyInput}
                value={askText}
                onChange={(event) => setAskText(event.target.value)}
                placeholder="Wolf is lost"
                rows={3}
                disabled={askState !== 'idle'}
              />
              <button
                type="submit"
                className={styles.replySend}
                aria-label="Send"
                disabled={askState !== 'idle' || !askText.trim()}
              >
                <ArrowUp size={16} strokeWidth={2.4} />
              </button>
            </div>
            {askError ? <div className={styles.replyError}>{askError}</div> : null}
          </form>
        )}
        {showProposalActions && (
          <div className={styles.activityActionRow}>
            <button
              type="button"
              className={[
                styles.confirmButton,
                proposalState === 'accepting' ? styles.confirmButtonLoading : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-label="Accept routing proposal"
              disabled={proposalState !== 'idle'}
              onClick={handleAcceptProposal}
            >
              <Check size={16} strokeWidth={2.4} />
              Accept
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
          </div>
        )}
        {isRoutingInstruction && item.status === 'completed' && !item.thinking && (
          <span className={styles.executedLabel}>
            <Check size={16} strokeWidth={2.4} />
            Executed
          </span>
        )}
        {showKycLink && (
          <button
            type="button"
            className={styles.downloadButton}
            aria-label="Update KYC documents"
            onClick={handleKycLink}
          >
            <ExternalLink size={18} strokeWidth={2} />
          </button>
        )}
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
}: {
  title: string
  items: ActivityItem[]
  latestAwaitingId: string | null
  latestActivityId: string | null
  onRoutingAsk: (item: ActivityItem, message: string) => Promise<void>
  onAcceptProposal: (item: ActivityItem) => Promise<void>
  onDiscardProposal: (item: ActivityItem) => Promise<void>
}) {
  if (items.length === 0) return null

  return (
    <div className={styles.activitySection}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <div className={styles.activityList}>
        {items.map((item) => (
          <ActivityItemCard
            key={item.id}
            item={item}
            showRoutingActions={item.id === latestAwaitingId}
            showAsk={item.id === latestActivityId}
            onRoutingAsk={onRoutingAsk}
            onAcceptProposal={onAcceptProposal}
            onDiscardProposal={onDiscardProposal}
          />
        ))}
      </div>
    </div>
  )
}

export function NotificationsList({ searchQuery = '' }: { searchQuery?: string }) {
  const clear = useActivityStore((s) => s.clear)
  const all = useActivityStore((s) => s.all)
  const isAuthed = useAuthStore((s) => s.isAuthed)
  const [remoteItems, setRemoteItems] = useState<ActivityItem[]>([])
  const [thinkingItem, setThinkingItem] = useState<ActivityItem | null>(null)
  const [visibleCount, setVisibleCount] = useState(ACTIVITY_PAGE_SIZE)
  
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
    if (!thinkingItem) return
    const arrived = remoteItems.some(
      (item) =>
        item.kind === 'CONVERSION_ROUTING_INSTRUCTION' &&
        item.thinking !== true &&
        item.testRunId === thinkingItem.testRunId &&
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
  const filteredItems = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    return allItems.filter((item) => {
      if (item.thinking) return !normalizedQuery || searchableText(item).includes(normalizedQuery)
      if (!isPaymentActivity(item)) return false
      return !normalizedQuery || searchableText(item).includes(normalizedQuery)
    })
  }, [allItems, searchQuery])
  useEffect(() => {
    setVisibleCount(ACTIVITY_PAGE_SIZE)
  }, [searchQuery])
  const isSearching = searchQuery.trim().length > 0
  const pagedItems = useMemo(
    () => (isSearching ? filteredItems : filteredItems.slice(0, visibleCount)),
    [filteredItems, isSearching, visibleCount]
  )
  const hasMore = !isSearching && visibleCount < filteredItems.length
  const latestAwaitingId = useMemo(() => latestAwaitingRoutingId(allItems), [allItems])
  const latestActivityId = useMemo(
    () => filteredItems.find((item) => item.thinking !== true)?.id ?? null,
    [filteredItems]
  )
  const { today, yesterday, last7Days, last30Days, older } = useMemo(
    () => groupByTimePeriod(pagedItems),
    [pagedItems]
  )

  const handleRoutingAsk = async (source: ActivityItem, message: string) => {
    const routing =
      allItems.find(isAwaitingRoutingItem) ||
      allItems.find((item) => Boolean(item.testRunId) && item.thinking !== true)
    const testRunId = source.testRunId || routing?.testRunId
    const cycleNumber = source.cycleNumber || routing?.cycleNumber
    setThinkingItem({
      id: `thinking-ask-${Date.now()}`,
      kind: 'CONVERSION_ROUTING_INSTRUCTION',
      actor: {
        type: 'ai',
        name: '$ariel',
        avatarUrl: TASK_AVATARS.convertZar,
      },
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
    if (!item.proposalId) return
    setThinkingItem({
      id: `thinking-accept-${item.proposalId}`,
      kind: 'CONVERSION_ROUTING_INSTRUCTION',
      actor: {
        type: 'ai',
        name: '$ariel',
        avatarUrl: TASK_AVATARS.convertZar,
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

  const sectionProps = {
    latestAwaitingId,
    latestActivityId,
    onRoutingAsk: handleRoutingAsk,
    onAcceptProposal: handleAcceptProposal,
    onDiscardProposal: handleDiscardProposal,
  }

  return (
    <div className={styles.activityContainer}>
      <ActivitySection title="Today" items={today} {...sectionProps} />
      <ActivitySection title="Yesterday" items={yesterday} {...sectionProps} />
      <ActivitySection title="Last 7 days" items={last7Days} {...sectionProps} />
      <ActivitySection title="Last 30 days" items={last30Days} {...sectionProps} />
      <ActivitySection title="Older" items={older} {...sectionProps} />
      {hasMore && (
        <div className={styles.activityList}>
          <button
            type="button"
            className={styles.moreButton}
            onClick={() => setVisibleCount((count) => count + ACTIVITY_PAGE_SIZE)}
          >
            More...
          </button>
        </div>
      )}
      {filteredItems.length === 0 && (
        <p className={styles.emptyState}>
          {searchQuery.trim() ? 'No matching payment activity.' : 'No payment activity yet.'}
        </p>
      )}
    </div>
  )
}

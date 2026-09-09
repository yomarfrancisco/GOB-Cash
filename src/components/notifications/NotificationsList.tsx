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
const PERIOD_PREVIEW_LIMIT = 4

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
    item.status !== 'completed' &&
    item.status !== 'superseded' &&
    item.status !== 'cancelled'
  )
}

function latestAwaitingRoutingId(items: ActivityItem[]): string | null {
  return items.find(isAwaitingRoutingItem)?.id ?? null
}

function ActivityItemCard({
  item,
  showRoutingActions,
  onRoutingReply,
}: {
  item: ActivityItem
  showRoutingActions: boolean
  onRoutingReply: (item: ActivityItem, message: string) => Promise<void>
}) {
  const router = useRouter()
  const closeNotifications = useNotificationsStore((s) => s.closeNotifications)
  const profile = useUserProfileStore((s) => s.profile)
  const isCopied = isCopiedActivity(item)
  const avatarUrl = isCopied ? null : resolveTaskAvatar(item)
  const showUserPlaceholder = isCopied || isUserPlaceholderAvatar(avatarUrl)
  const [downloadState, setDownloadState] = useState<'idle' | 'loading' | 'pressed'>('idle')
  const [confirmState, setConfirmState] = useState<'idle' | 'loading' | 'pressed'>('idle')
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [replyState, setReplyState] = useState<'idle' | 'loading'>('idle')
  const [replyError, setReplyError] = useState('')
  const showDownload = canDownloadProof(item)
  const showKycLink = item.hasKycLink === true
  const isRoutingInstruction = item.kind === 'CONVERSION_ROUTING_INSTRUCTION'
  const isAwaitingRouting = showRoutingActions && isAwaitingRoutingItem(item)
  const showConfirm = isAwaitingRouting && item.routingBlocked !== true
  const showReply = isAwaitingRouting && item.routingAction !== 'replenish'

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

  const handleToggleReply = (event: React.MouseEvent) => {
    event.stopPropagation()
    setReplyError('')
    setReplyOpen((open) => !open)
  }

  const handleSubmitReply = async (event: React.FormEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const message = replyText.trim()
    if (!message || replyState !== 'idle') return
    setReplyState('loading')
    setReplyError('')
    setReplyOpen(false)
    try {
      await onRoutingReply(item, message)
      setReplyText('')
    } catch (error) {
      setReplyOpen(true)
      setReplyError(error instanceof Error ? error.message : 'Could not apply that reply')
    } finally {
      setReplyState('idle')
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
            {item.body ? <div className={styles.activityBody}>{item.body}</div> : null}
            {item.userReply ? (
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
            {showReply && (
              <button
                type="button"
                className={styles.replyButton}
                aria-label="Reply to conversion instruction"
                aria-expanded={replyOpen}
                onClick={handleToggleReply}
              >
                Reply
              </button>
            )}
          </div>
        )}
        {!showConfirm && showReply && (
          <div className={styles.activityActionRow}>
            <button
              type="button"
              className={styles.replyButton}
              aria-label="Reply to conversion instruction"
              aria-expanded={replyOpen}
              onClick={handleToggleReply}
            >
              Reply
            </button>
          </div>
        )}
        {showReply && replyOpen && (
          <form className={styles.replyComposer} onSubmit={handleSubmitReply} onClick={(event) => event.stopPropagation()}>
            <div className={styles.replyFrame}>
              <textarea
                className={styles.replyInput}
                value={replyText}
                onChange={(event) => setReplyText(event.target.value)}
                placeholder="Card 5 is unavailable for this cycle."
                rows={3}
                disabled={replyState !== 'idle'}
              />
              <button
                type="submit"
                className={styles.replySend}
                aria-label="Send reply"
                disabled={replyState !== 'idle' || !replyText.trim()}
              >
                <ArrowUp size={16} strokeWidth={2.4} />
              </button>
            </div>
            {replyError ? <div className={styles.replyError}>{replyError}</div> : null}
          </form>
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
  onRoutingReply,
}: {
  title: string
  items: ActivityItem[]
  latestAwaitingId: string | null
  onRoutingReply: (item: ActivityItem, message: string) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const hasMore = items.length > PERIOD_PREVIEW_LIMIT
  const visibleItems = expanded || !hasMore ? items : items.slice(0, PERIOD_PREVIEW_LIMIT)

  if (items.length === 0) return null

  return (
    <div className={styles.activitySection}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <div className={styles.activityList}>
        {visibleItems.map((item) => (
          <ActivityItemCard
            key={item.id}
            item={item}
            showRoutingActions={item.id === latestAwaitingId}
            onRoutingReply={onRoutingReply}
          />
        ))}
        {hasMore && !expanded && (
          <button
            type="button"
            className={styles.moreButton}
            onClick={() => setExpanded(true)}
          >
            More...
          </button>
        )}
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
  const [pendingReplies, setPendingReplies] = useState<Record<string, string>>({})
  
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
        item.cycleNumber === thinkingItem.cycleNumber &&
        item.createdAt >= thinkingItem.createdAt - 2500
    )
    if (arrived) setThinkingItem(null)
  }, [remoteItems, thinkingItem])

  useEffect(() => {
    setPendingReplies((prev) => {
      let changed = false
      const next = { ...prev }
      for (const item of remoteItems) {
        if (item.userReply && next[item.id]) {
          delete next[item.id]
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [remoteItems])
  
  const localItems = useActivityStore((s) => s.all())
  const allItems = useMemo(() => {
    const remoteIds = new Set(remoteItems.map((item) => item.id))
    const merged = [
      ...(thinkingItem ? [thinkingItem] : []),
      ...remoteItems,
      ...localItems.filter((item) => !remoteIds.has(item.id) && item.id !== thinkingItem?.id),
    ]
    return merged
      .map((item) =>
        pendingReplies[item.id] && !item.userReply
          ? { ...item, userReply: pendingReplies[item.id], userRepliedAt: item.userRepliedAt || Date.now() }
          : item
      )
      .sort((a, b) => b.createdAt - a.createdAt)
  }, [localItems, remoteItems, thinkingItem, pendingReplies])
  const filteredItems = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    return allItems.filter((item) => {
      if (item.thinking) return !normalizedQuery || searchableText(item).includes(normalizedQuery)
      if (!isPaymentActivity(item)) return false
      return !normalizedQuery || searchableText(item).includes(normalizedQuery)
    })
  }, [allItems, searchQuery])
  const latestAwaitingId = useMemo(
    () => (thinkingItem ? null : latestAwaitingRoutingId(allItems)),
    [allItems, thinkingItem]
  )
  const { today, yesterday, last7Days, last30Days, older } = useMemo(
    () => groupByTimePeriod(filteredItems),
    [filteredItems]
  )

  const handleRoutingReply = async (source: ActivityItem, message: string) => {
    setPendingReplies((prev) => ({ ...prev, [source.id]: message }))
    setThinkingItem({
      id: `thinking-${source.cycleNumber || source.id}-${Date.now()}`,
      kind: 'CONVERSION_ROUTING_INSTRUCTION',
      actor: {
        type: 'ai',
        name: '$ariel',
        avatarUrl: TASK_AVATARS.convertZar,
      },
      title: source.title,
      thinking: true,
      createdAt: Date.now(),
      cycleNumber: source.cycleNumber,
      testRunId: source.testRunId,
      awaitingConfirm: false,
      avatarKind: 'convert_zar',
    })
    try {
      await admin_submitConversionRoutingFeedback({
        message,
        testRunId: source.testRunId,
        cycleNumber: source.cycleNumber,
        cardCount: 5,
        machineCount: 3,
        assignments: parseRoutingAssignmentsFromBody(source.body),
      })
    } catch (error) {
      setPendingReplies((prev) => {
        const next = { ...prev }
        delete next[source.id]
        return next
      })
      setThinkingItem(null)
      throw error
    }
  }

  return (
    <div className={styles.activityContainer}>
      <ActivitySection
        title="Today"
        items={today}
        latestAwaitingId={latestAwaitingId}
        onRoutingReply={handleRoutingReply}
      />
      <ActivitySection
        title="Yesterday"
        items={yesterday}
        latestAwaitingId={latestAwaitingId}
        onRoutingReply={handleRoutingReply}
      />
      <ActivitySection
        title="Last 7 days"
        items={last7Days}
        latestAwaitingId={latestAwaitingId}
        onRoutingReply={handleRoutingReply}
      />
      <ActivitySection
        title="Last 30 days"
        items={last30Days}
        latestAwaitingId={latestAwaitingId}
        onRoutingReply={handleRoutingReply}
      />
      <ActivitySection
        title="Older"
        items={older}
        latestAwaitingId={latestAwaitingId}
        onRoutingReply={handleRoutingReply}
      />
      {filteredItems.length === 0 && (
        <p className={styles.emptyState}>
          {searchQuery.trim() ? 'No matching payment activity.' : 'No payment activity yet.'}
        </p>
      )}
    </div>
  )
}

'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { ArrowUp, Check } from 'lucide-react'
import { useActivityStore, type ActivityItem } from '@/store/activity'
import { subscribeToActivityEvents } from '@/lib/activity/activityEvents'
import { admin_submitConversionRoutingFeedback } from '@/lib/transactions/clientFunctions'
import { useRoutingPlaybackStore } from '@/store/routingPlayback'
import { useAuthStore } from '@/store/auth'
import { parseRoutingAssignmentsFromBody } from '@/lib/routing/interpretAdminFeedback'
import { useSignedInKycAccess } from '@/lib/restrictions'
import { prefetchDiditSdk, startDiditVerification } from '@/lib/startDiditVerification'
import {
  DESK_TEAM,
  buildDeskThread,
  buildNextStep,
  hasLiveStep,
  isDeskNo,
  isDeskYes,
  latestPendingWrite,
  type DeskDayRow,
  type DeskNextStep,
} from '@/lib/desk/threadModel'
import styles from './FxDesk.module.css'

const PAGE = 40
const KYC_ID = 'kyc-desk-gate'

function DayCard({ row }: { row: DeskDayRow }) {
  const [open, setOpen] = useState(false)
  const max = Math.max(row.recommendedZar || 0, row.heldZar || 0, 1)
  return (
    <article className={styles.day}>
      <h3 className={styles.dayTitle}>{row.title}</h3>
      <p className={styles.dayResult}>{row.result}</p>
      {(row.recommendedZar || row.heldZar) && (
        <div className={styles.bars}>
          {row.recommendedZar != null && (
            <div className={styles.barRow}>
              <span className={styles.barLabel}>Recommended</span>
              <div className={styles.barTrack}>
                <div className={styles.barFill} style={{ width: `${Math.min(100, (row.recommendedZar / max) * 100)}%` }} />
              </div>
            </div>
          )}
          {row.heldZar != null && (
            <div className={styles.barRow}>
              <span className={styles.barLabel}>Held back</span>
              <div className={styles.barTrack}>
                <div
                  className={`${styles.barFill} ${styles.barHeld}`}
                  style={{ width: `${Math.min(100, (row.heldZar / max) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}
      {row.pairs.length > 0 && (
        <>
          <button type="button" className={styles.pairsToggle} onClick={() => setOpen((value) => !value)}>
            {open ? 'Hide pairs · Leo' : 'Named pairs · Leo'}
          </button>
          {open && (
            <ul className={styles.pairs}>
              {row.pairs.map((pair) => (
                <li key={pair}>{pair}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </article>
  )
}

function StepCard({
  next,
  clockState,
  onClock,
  onStartAgain,
}: {
  next: DeskNextStep
  clockState: 'idle' | 'loading'
  onClock: () => void
  onStartAgain: () => void
}) {
  return (
    <article className={styles.day}>
      <h3 className={styles.dayTitle}>{next.title}</h3>
      <p className={styles.dayResult}>{next.body}</p>
      {next.stillToDeliver && <p className={styles.leftover}>Still to deliver · {next.stillToDeliver}</p>}
      {(next.clock || next.startAgain) && (
        <div className={styles.nextActions}>
          {next.clock && (
            <button
              type="button"
              className={styles.clock}
              disabled={clockState !== 'idle' && next.clock !== 'kyc'}
              onClick={onClock}
            >
              {(next.clock === 'sent' || next.clock === 'swiped') && <Check size={14} strokeWidth={2.4} />}
              {next.clockLabel}
            </button>
          )}
          {next.startAgain && next.clock !== 'start' && (
            <button type="button" className={styles.secondary} onClick={onStartAgain}>
              Start again
            </button>
          )}
        </div>
      )}
    </article>
  )
}

export function FxDeskThread() {
  const clear = useActivityStore((s) => s.clear)
  const all = useActivityStore((s) => s.all)
  const isAuthed = useAuthStore((s) => s.isAuthed)
  const { deskBlocked, kycCta } = useSignedInKycAccess()
  const [remoteItems, setRemoteItems] = useState<ActivityItem[]>([])
  const [thinking, setThinking] = useState(false)
  const [draft, setDraft] = useState('')
  const [sendState, setSendState] = useState<'idle' | 'loading'>('idle')
  const [clockState, setClockState] = useState<'idle' | 'loading'>('idle')
  const [error, setError] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE)
  const threadRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const items = all()
    const bad =
      !Array.isArray(items) ||
      items.some((item) => !item || typeof item.id !== 'string' || !Number.isFinite(item.createdAt))
    if (bad) clear()
  }, [all, clear])

  useEffect(() => {
    if (!isAuthed) {
      setRemoteItems([])
      setThinking(false)
      return
    }
    return subscribeToActivityEvents(setRemoteItems)
  }, [isAuthed])

  useEffect(() => {
    if (deskBlocked) prefetchDiditSdk()
  }, [deskBlocked])

  const localItems = useActivityStore((s) => s.all())
  const allItems = useMemo(() => {
    const remoteIds = new Set(remoteItems.map((item) => item.id))
    return [...remoteItems, ...localItems.filter((item) => !remoteIds.has(item.id))].sort(
      (a, b) => b.createdAt - a.createdAt
    )
  }, [localItems, remoteItems])

  const deskItems = useMemo(
    () =>
      allItems.filter(
        (item) =>
          item.id !== KYC_ID &&
          (item.kind === 'CONVERSION_ROUTING_INSTRUCTION' ||
            item.kind === 'KYC_REQUIRED' ||
            Boolean(item.testRunId))
      ),
    [allItems]
  )

  const thread = useMemo(() => buildDeskThread(deskItems), [deskItems])
  const visibleThread = thread.slice(Math.max(0, thread.length - visibleCount))
  const hasMore = thread.length > visibleCount
  const pendingWrite = latestPendingWrite(deskItems)
  const next = useMemo(
    () => buildNextStep(deskItems, { kyc: deskBlocked, kycLabel: kycCta }),
    [deskItems, deskBlocked, kycCta]
  )

  useEffect(() => {
    const el = threadRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [visibleThread.length, thinking, next.title])

  const routingAnchor =
    deskItems.find((item) => item.awaitingConfirm && item.testRunId) ||
    deskItems.find((item) => item.testRunId)

  const sendAsk = async (raw: string) => {
    const message = raw.trim()
    if (!message || sendState !== 'idle') return
    if (deskBlocked) {
      setError('Complete KYC before continuing.')
      return
    }
    setSendState('loading')
    setError('')
    setThinking(true)
    try {
      if (pendingWrite && isDeskYes(message)) {
        await admin_submitConversionRoutingFeedback({
          acceptProposalId: pendingWrite.proposalId,
          testRunId: pendingWrite.testRunId,
          cycleNumber: pendingWrite.cycleNumber,
        })
      } else if (pendingWrite && isDeskNo(message)) {
        await admin_submitConversionRoutingFeedback({
          discardProposalId: pendingWrite.proposalId,
          testRunId: pendingWrite.testRunId,
          cycleNumber: pendingWrite.cycleNumber,
        })
      } else {
        await admin_submitConversionRoutingFeedback({
          message,
          testRunId: routingAnchor?.testRunId,
          cycleNumber: routingAnchor?.cycleNumber,
          cardCount: 5,
          machineCount: 4,
          assignments: parseRoutingAssignmentsFromBody(next.item?.body || routingAnchor?.body),
        })
      }
      setDraft('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sam could not take that just now.')
    } finally {
      setThinking(false)
      setSendState('idle')
    }
  }

  const handleClock = () => {
    if (next.clock === 'kyc') {
      void startDiditVerification()
      return
    }
    if (next.clock === 'start' && next.item) {
      void sendAsk('start the next run')
      return
    }
    const item = next.item
    if (!item || clockState !== 'idle') return
    const isReplenish = item.routingAction === 'replenish'
    const amountZAR = isReplenish ? item.pairedAmountValue : item.amount?.value
    const amountMZN = isReplenish ? item.amount?.value : item.pairedAmountValue
    if (isReplenish && (!(typeof amountMZN === 'number') || amountMZN <= 0)) return
    if (!isReplenish && (!(typeof amountZAR === 'number') || amountZAR <= 0)) return
    setClockState('loading')
    useRoutingPlaybackStore.getState().requestPlay({
      destination: isReplenish ? 'ZAR' : 'MZN',
      amountZAR: amountZAR || 0,
      amountMZN: amountMZN || 0,
      testRunId: item.testRunId,
      cycleNumber: item.cycleNumber,
      routingAction: isReplenish ? 'replenish' : 'deploy',
    })
  }

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.stack} aria-hidden>
          <div className={`${styles.stackFace} ${styles.stackAmina}`}>
            <Image src={DESK_TEAM.amina.avatar} alt="" width={28} height={28} unoptimized />
          </div>
          <div className={`${styles.stackFace} ${styles.stackLeo}`}>
            <Image src={DESK_TEAM.leo.avatar} alt="" width={28} height={28} unoptimized />
          </div>
          <div className={`${styles.stackFace} ${styles.stackSam}`}>
            <Image src={DESK_TEAM.sam.avatar} alt="" width={36} height={36} unoptimized />
          </div>
        </div>
        <div className={styles.headerCopy}>
          <p className={styles.headerName}>Sam</p>
          <p className={styles.headerRole}>Relationship manager</p>
        </div>
      </header>

      <div className={styles.thread} ref={threadRef}>
        {hasMore && (
          <button type="button" className={styles.more} onClick={() => setVisibleCount((count) => count + PAGE)}>
            Earlier in this window
          </button>
        )}
        {visibleThread.length === 0 && !thinking && !hasLiveStep(next) && (
          <p className={styles.empty}>This window is empty. Ask Sam what is next.</p>
        )}
        {visibleThread.map((row) => {
          if (row.kind === 'day') return <DayCard key={row.id} row={row} />
          const team = row.speaker === 'leo' || row.speaker === 'amina' ? DESK_TEAM[row.speaker] : null
          const tone =
            row.speaker === 'you'
              ? styles.youText
              : row.speaker === 'amina'
                ? styles.aminaText
                : row.speaker === 'leo'
                  ? styles.leoText
                  : styles.samText
          return (
            <div
              key={row.id}
              className={`${styles.row} ${row.speaker === 'you' ? styles.rowYou : styles.rowTeam} ${row.speaker === 'sam' ? styles.rowSam : ''}`}
            >
              {team && (
                <div className={styles.face}>
                  <Image src={team.avatar} alt="" width={28} height={28} unoptimized />
                </div>
              )}
              <div className={styles.bubble}>
                {team && (
                  <p className={styles.who}>
                    {team.name} {team.role}
                  </p>
                )}
                <p className={`${styles.text} ${tone}`}>{row.text}</p>
                {row.pendingConfirm && <p className={styles.pending}>Not saved yet — type yes if this should stand.</p>}
              </div>
            </div>
          )
        })}
        {thinking && (
          <div className={`${styles.row} ${styles.rowTeam} ${styles.rowSam}`}>
            <div className={styles.thinking} aria-label="Sam is writing">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
        {hasLiveStep(next) && (
          <StepCard
            next={next}
            clockState={clockState}
            onClock={handleClock}
            onStartAgain={() => void sendAsk('start the next run')}
          />
        )}
      </div>

      <div className={styles.dock}>
        <form
          className={styles.composer}
          onSubmit={(event) => {
            event.preventDefault()
            void sendAsk(draft)
          }}
        >
          <textarea
            className={styles.field}
            rows={1}
            value={draft}
            placeholder="Ask Sam"
            disabled={sendState !== 'idle' || deskBlocked}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void sendAsk(draft)
              }
            }}
          />
          <button type="submit" className={styles.send} disabled={sendState !== 'idle' || !draft.trim() || deskBlocked} aria-label="Send">
            <ArrowUp size={16} strokeWidth={2.4} />
          </button>
        </form>
        {error ? <p className={styles.error}>{error}</p> : null}
      </div>
    </div>
  )
}

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, X } from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { useUserProfileStore } from '@/store/userProfile'
import { useActivityStore, type ActivityItem } from '@/store/activity'
import { subscribeToActivityEvents } from '@/lib/activity/activityEvents'
import {
  admin_getConversionRoutingStatus,
  admin_submitConversionRoutingFeedback,
  downloadSettlementInvoice,
  type ConversionRoutingSummary,
} from '@/lib/transactions/clientFunctions'
import { buildFxDeskView, type DeskFeedLine, type DeskRichPart } from '@/lib/desk/fxDeskModel'
import { useNotificationsStore } from '@/state/notifications'
import styles from './FxDeskPanel.module.css'

const SPEEDS = [
  { label: '1×', ms: 1500 },
  { label: '1.5×', ms: 1000 },
  { label: '2×', ms: 750 },
] as const

function RichText({
  parts,
  onViewInvoices,
}: {
  parts: DeskRichPart[]
  onViewInvoices?: () => void
}) {
  return (
    <p className={styles.body}>
      {parts.map((part, index) => {
        const className = [
          part.bold ? styles.bold : '',
          part.tone === 'success' ? styles.success : '',
          part.tone === 'held' ? styles.held : '',
        ]
          .filter(Boolean)
          .join(' ')
        if (part.href === 'invoices' && onViewInvoices) {
          return (
            <button key={index} type="button" className={styles.link} onClick={onViewInvoices}>
              {part.text}
            </button>
          )
        }
        return (
          <span key={index} className={className || undefined}>
            {part.text}
          </span>
        )
      })}
    </p>
  )
}

function FeedLineView({
  line,
  onViewInvoices,
}: {
  line: DeskFeedLine
  onViewInvoices?: () => void
}) {
  if (line.kind === 'exception') {
    return (
      <article className={`${styles.exception} ${styles.lineEnter}`}>
        <p className={styles.meta}>
          {line.timeLabel} · {line.source}
        </p>
        {line.exceptionTitle ? <h3 className={styles.exceptionTitle}>{line.exceptionTitle}</h3> : null}
        <RichText parts={line.parts} />
        {line.exceptionFollowUp ? <p className={styles.exceptionFollow}>{line.exceptionFollowUp}</p> : null}
      </article>
    )
  }
  return (
    <article className={`${styles.line} ${styles.lineEnter}`}>
      <p className={styles.meta}>
        {line.timeLabel} · {line.source}
      </p>
      <RichText parts={line.parts} onViewInvoices={onViewInvoices} />
    </article>
  )
}

export default function FxDeskPanel() {
  const closeNotifications = useNotificationsStore((s) => s.closeNotifications)
  const isAuthed = useAuthStore((s) => s.isAuthed)
  const fullName = useUserProfileStore((s) => s.profile?.fullName)
  const localItems = useActivityStore((s) => s.all())
  const [remoteItems, setRemoteItems] = useState<ActivityItem[]>([])
  const [summary, setSummary] = useState<ConversionRoutingSummary | null>(null)
  const [askText, setAskText] = useState('')
  const [askState, setAskState] = useState<'idle' | 'loading'>('idle')
  const [askError, setAskError] = useState('')
  const [speedIndex, setSpeedIndex] = useState(0)
  const [replayDone, setReplayDone] = useState(false)
  const [visibleCount, setVisibleCount] = useState(0)
  const [replayNonce, setReplayNonce] = useState(0)
  const feedRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isAuthed) {
      setRemoteItems([])
      return
    }
    return subscribeToActivityEvents(setRemoteItems)
  }, [isAuthed])

  useEffect(() => {
    if (!isAuthed) return
    let cancelled = false
    void admin_getConversionRoutingStatus()
      .then((row) => {
        if (!cancelled) setSummary(row)
      })
      .catch(() => {
        if (!cancelled) setSummary(null)
      })
    return () => {
      cancelled = true
    }
  }, [isAuthed, remoteItems.length])

  const items = useMemo(() => {
    const remoteIds = new Set(remoteItems.map((item) => item.id))
    return [...remoteItems, ...localItems.filter((item) => !remoteIds.has(item.id))].sort(
      (a, b) => a.createdAt - b.createdAt
    )
  }, [localItems, remoteItems])

  const desk = useMemo(
    () => buildFxDeskView({ items, summary, fullName }),
    [items, summary, fullName]
  )

  const replayLines = desk.replayLines
  const speed = SPEEDS[speedIndex] || SPEEDS[0]

  useEffect(() => {
    setVisibleCount(0)
    setReplayDone(replayLines.length === 0)
  }, [replayNonce, replayLines.length])

  useEffect(() => {
    if (replayDone) return
    if (visibleCount >= replayLines.length) {
      setReplayDone(true)
      return
    }
    const timer = window.setTimeout(() => {
      setVisibleCount((count) => Math.min(replayLines.length, count + 1))
    }, visibleCount === 0 ? 350 : speed.ms)
    return () => window.clearTimeout(timer)
  }, [visibleCount, replayDone, replayLines.length, speed.ms])

  useEffect(() => {
    const node = feedRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [visibleCount, replayDone, desk.liveLines.length, desk.tickets.length])

  const shownReplay = replayDone ? replayLines : replayLines.slice(0, visibleCount)

  const handleSkip = () => {
    setVisibleCount(replayLines.length)
    setReplayDone(true)
  }

  const handleReplay = () => {
    setReplayNonce((n) => n + 1)
    setVisibleCount(0)
    setReplayDone(false)
  }

  const cycleSpeed = () => setSpeedIndex((index) => (index + 1) % SPEEDS.length)

  const handleViewInvoices = useCallback(async () => {
    const pack = [...items]
      .reverse()
      .find((item) => item.invoiceZipStoragePath || item.invoicePackId || item.invoiceId)
    if (!pack) return
    if (pack.invoiceZipStoragePath) {
      await downloadSettlementInvoice(pack.invoicePackId || pack.invoiceId || 'pack', {
        invoiceZipStoragePath: pack.invoiceZipStoragePath,
        invoiceZipFilename: pack.invoiceZipFilename,
      })
      return
    }
    if (pack.invoiceId) await downloadSettlementInvoice(pack.invoiceId)
  }, [items])

  const handleAsk = async (event?: { preventDefault: () => void }) => {
    event?.preventDefault()
    const message = askText.trim()
    if (!message || askState !== 'idle') return
    setAskState('loading')
    setAskError('')
    try {
      await admin_submitConversionRoutingFeedback({
        message,
        testRunId: desk.testRunId,
        cycleNumber: desk.cycleNumber,
        cardCount: 5,
        machineCount: 4,
      })
      setAskText('')
    } catch (error) {
      setAskError(error instanceof Error ? error.message : 'The desk could not take that just now.')
    } finally {
      setAskState('idle')
    }
  }

  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>FX Desk</h1>
          <p className={styles.statusLine}>
            {desk.dayLabel}
            {' · '}
            <span className={desk.badge.tone === 'held' ? styles.badgeHeld : styles.badgeOk}>
              {desk.badge.label}
            </span>
            {' · '}
            {desk.windowPctLabel}
          </p>
        </div>
        <button type="button" className={styles.close} aria-label="Close" onClick={closeNotifications}>
          <X size={16} strokeWidth={2.2} />
        </button>
      </header>

      <div className={styles.feed} ref={feedRef} data-desk-feed>
        <div className={styles.replayBar}>
          <p className={styles.greeting}>{desk.greeting}</p>
          <div className={styles.replayControls}>
            {!replayDone ? (
              <button type="button" className={styles.ghostBtn} onClick={handleSkip}>
                Skip to now
              </button>
            ) : (
              <button type="button" className={styles.ghostBtn} onClick={handleReplay}>
                Replay
              </button>
            )}
            <button type="button" className={styles.speed} onClick={cycleSpeed} aria-label="Replay speed">
              {speed.label}
            </button>
          </div>
        </div>

        {shownReplay.map((line) => (
          <FeedLineView key={`${replayNonce}-${line.id}`} line={line} onViewInvoices={handleViewInvoices} />
        ))}

        {replayDone ? (
          <>
            {desk.liveLines.map((line) => (
              <FeedLineView key={line.id} line={line} />
            ))}

            {(desk.tickets.length > 0 || desk.stillIntro) && (
              <>
                <hr className={styles.divider} />
                <h2 className={styles.stillTitle}>Still to run today</h2>
                {desk.stillIntro ? <p className={styles.stillIntro}>{desk.stillIntro}</p> : null}
                <div className={styles.ticketList}>
                  {desk.tickets.map((ticket) => {
                    const rowClass = [
                      styles.ticket,
                      ticket.status === 'next' ? styles.ticketNext : '',
                      ticket.status === 'settled' ? styles.ticketDone : '',
                      ticket.status === 'held' ? styles.ticketHeldRow : '',
                    ]
                      .filter(Boolean)
                      .join(' ')
                    return (
                      <div key={ticket.id} className={rowClass}>
                        <span className={styles.ticketTime}>{ticket.timeLabel}</span>
                        <span>
                          <span className={styles.ticketCard}>{ticket.cardName}</span>
                          <span className={styles.ticketArrow}> → {ticket.merchantName}</span>
                          {ticket.status === 'settled' ? (
                            <>
                              {' · '}
                              <span className={`${styles.statusWord} ${styles.statusSettled}`}>settled</span>
                            </>
                          ) : null}
                          {ticket.status === 'held' ? (
                            <>
                              {' · '}
                              <span className={`${styles.statusWord} ${styles.statusHeld}`}>held</span>
                            </>
                          ) : null}
                        </span>
                        <span className={styles.ticketAmount}>{ticket.amountLabel}</span>
                      </div>
                    )
                  })}
                </div>
                {desk.stillTotalLabel ? (
                  <p className={styles.stillTotal}>
                    Today&apos;s restock <strong>{desk.stillTotalLabel}</strong>
                  </p>
                ) : null}
              </>
            )}

            {!desk.replayLines.length && !desk.tickets.length && !desk.liveLines.length ? (
              <p className={styles.empty}>No desk activity in the last day yet. Ask the desk what&apos;s next.</p>
            ) : null}
          </>
        ) : null}
      </div>

      <form className={styles.askDock} onSubmit={handleAsk}>
        <div className={styles.askRow}>
          <textarea
            className={styles.askInput}
            rows={1}
            value={askText}
            placeholder="Ask the desk"
            disabled={askState !== 'idle'}
            onChange={(event) => setAskText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void handleAsk(event)
              }
            }}
          />
          <button
            type="submit"
            className={styles.askSend}
            disabled={askState !== 'idle' || !askText.trim()}
            aria-label="Send"
          >
            <ArrowUp size={18} strokeWidth={2.4} />
          </button>
        </div>
        {askError ? <p className={styles.askError}>{askError}</p> : null}
      </form>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import ActionSheet from '../ActionSheet'
import { useNotificationsStore } from '@/state/notifications'
import { useActivityUnreadStore } from '@/store/activityUnread'
import { NotificationsList } from './NotificationsList'
import { DESK_RING, DESK_TEAM, type DeskAgent } from '@/lib/desk/threadModel'
import { useDeskSpeakerStore } from '@/store/deskSpeaker'
import { subscribeToActivityEvents } from '@/lib/activity/activityEvents'
import { formatSastDayLabel } from '@/lib/routing/routingTime'
import type { ActivityItem } from '@/store/activity'
import {
  admin_exitDeskPlan,
  admin_getConversionRoutingStatus,
  type ConversionRoutingSummary,
} from '@/lib/transactions/clientFunctions'
import { useDeskFocusStore } from '@/store/deskFocus'
import { useDeskPlanStore } from '@/store/deskPlan'
import { useDeskModeActionsStore } from '@/store/deskModeActions'
import { resetDeskRevealForLiveRestore } from '@/lib/desk/useProgressiveReveal'
import { useAuthStore } from '@/store/auth'
import listStyles from '../Inbox/FinancialInboxListSheet.module.css'
import activityStyles from '@/app/activity/activity.module.css'

const DESK_FACES = DESK_RING.map((id) => DESK_TEAM[id].avatar)

/** One Planned→live restore per page load; mid-session Next 24h must survive desk close/open. */
let plannedExitOnPageLoadDone = false

if (typeof window !== 'undefined') {
  DESK_FACES.forEach((src) => {
    const preload = new window.Image()
    preload.src = src
  })
}

/** Ring slot for each agent: the active one sits on top, the other two keep ring order below. */
const SLOT_CLASS = [listStyles.deskSlotTop, listStyles.deskSlotLeft, listStyles.deskSlotRight] as const

function slotFor(agent: DeskAgent, active: DeskAgent): string {
  const offset = (DESK_RING.indexOf(agent) - DESK_RING.indexOf(active) + DESK_RING.length) % DESK_RING.length
  return SLOT_CLASS[offset]
}

function DeskFace({ src, className, speaking }: { src: string; className: string; speaking: boolean }) {
  const [ready, setReady] = useState(false)
  return (
    <div className={`${listStyles.deskStackFace} ${className} ${speaking ? listStyles.deskFaceSpeaking : ''}`}>
      <img
        src={src}
        alt=""
        className={ready ? listStyles.deskFaceReady : listStyles.deskFacePending}
        onLoad={() => setReady(true)}
      />
    </div>
  )
}

export default function NotificationsSheet() {
  const { isNotificationsOpen, closeNotifications } = useNotificationsStore()
  const isAuthed = useAuthStore((s) => s.isAuthed)
  const active = useDeskSpeakerStore((s) => s.active)
  const focusAt = useDeskFocusStore((s) => s.focusAt)
  const planMode = useDeskPlanStore((s) => s.mode)
  const plannedClockMs = useDeskPlanStore((s) => s.plannedClockMs)
  const applyPlanSummary = useDeskPlanStore((s) => s.applySummary)
  const setLive = useDeskPlanStore((s) => s.setLive)
  const [remoteItems, setRemoteItems] = useState<ActivityItem[]>([])
  const [summary, setSummary] = useState<ConversionRoutingSummary | null>(null)
  const [deskLiveReady, setDeskLiveReady] = useState(false)
  const planned = planMode === 'planned' || summary?.deskMode === 'planned'
  const planBusy = useDeskPlanStore((s) => s.busy)
  const next24h = useDeskModeActionsStore((s) => s.next24h)
  const next72h = useDeskModeActionsStore((s) => s.next72h)
  const realtime = useDeskModeActionsStore((s) => s.realtime)
  const dayLabel = formatSastDayLabel(
    planned ? plannedClockMs || focusAt || Date.now() : focusAt ?? Date.now()
  )

  useEffect(() => {
    if (!isNotificationsOpen) return
    useActivityUnreadStore.getState().markSeen()
    window.scrollTo(0, 0)
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  }, [isNotificationsOpen])

  // On first desk open after a hard refresh, drop last session's Planned sim.
  // Later opens in this page load keep an in-progress Next 24h.
  useEffect(() => {
    if (!isNotificationsOpen || !isAuthed) {
      setDeskLiveReady(false)
      setRemoteItems([])
      return
    }
    let cancelled = false
    setDeskLiveReady(false)
    void (async () => {
      try {
        const row = await admin_getConversionRoutingStatus()
        if (cancelled) return
        const exitStalePlanned = row?.deskMode === 'planned' && !plannedExitOnPageLoadDone
        plannedExitOnPageLoadDone = true
        if (exitStalePlanned) {
          const live = await admin_exitDeskPlan()
          if (cancelled) return
          resetDeskRevealForLiveRestore()
          setSummary(live)
          applyPlanSummary(live)
          setLive()
        } else {
          setSummary(row)
          applyPlanSummary(row)
        }
      } catch {
        if (!cancelled) {
          plannedExitOnPageLoadDone = true
          setSummary(null)
          setLive()
        }
      } finally {
        if (!cancelled) setDeskLiveReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isNotificationsOpen, isAuthed, applyPlanSummary, setLive])

  useEffect(() => {
    if (!isNotificationsOpen || !isAuthed || !deskLiveReady) {
      if (!isNotificationsOpen || !isAuthed) setRemoteItems([])
      return
    }
    return subscribeToActivityEvents(setRemoteItems)
  }, [isNotificationsOpen, isAuthed, deskLiveReady])

  useEffect(() => {
    if (!isNotificationsOpen || !isAuthed || !deskLiveReady) return
    let cancelled = false
    const load = () => {
      void admin_getConversionRoutingStatus()
        .then((row) => {
          if (cancelled) return
          setSummary(row)
          applyPlanSummary(row)
        })
        .catch(() => {
          if (!cancelled) setSummary(null)
        })
    }
    load()
    const timer = window.setInterval(load, 20_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [isNotificationsOpen, isAuthed, deskLiveReady, remoteItems.length, applyPlanSummary])

  return (
    <ActionSheet
      open={isNotificationsOpen}
      onClose={closeNotifications}
      title=""
      size="tall"
      className={`${listStyles.financialInboxSheet} inboxTallSheet`}
    >
      <div className={`${listStyles.content} ${listStyles.activityContent}`}>
        <div className={listStyles.deskHeaderChrome} aria-hidden />
        <div className={listStyles.activitySearchOverlay}>
          <div className={listStyles.deskHeader}>
            <div className={listStyles.deskTeamStack} aria-hidden>
              {DESK_RING.map((id) => (
                <DeskFace
                  key={id}
                  src={DESK_TEAM[id].avatar}
                  className={slotFor(id, active)}
                  speaking={id === active}
                />
              ))}
            </div>
            <p className={listStyles.deskHeaderName}>$-Route</p>
            <p className={listStyles.deskHeaderRole}>{dayLabel}</p>
            <div
              className={activityStyles.deskModeBar}
              role="group"
              aria-label="Desk clock mode"
              style={{ marginTop: 10, pointerEvents: 'auto' }}
            >
              <button
                type="button"
                className={[
                  activityStyles.deskModeSeg,
                  !planned ? activityStyles.deskModeSegActive : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-pressed={!planned}
                disabled={planBusy || !realtime}
                onClick={() => realtime?.()}
              >
                Real time
              </button>
              <button
                type="button"
                className={[
                  activityStyles.deskModeSeg,
                  planned ? activityStyles.deskModeSegActive : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-pressed={planned}
                disabled={planBusy || !next24h}
                onClick={() => next24h?.()}
              >
                Next 24h
              </button>
              <button
                type="button"
                className={activityStyles.deskModeSeg}
                disabled={planBusy || !next72h}
                onClick={() => next72h?.()}
              >
                Next 72h
              </button>
            </div>
          </div>
        </div>
        {deskLiveReady ? <NotificationsList /> : null}
      </div>
    </ActionSheet>
  )
}

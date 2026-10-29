'use client'

import { useEffect, useState } from 'react'
import ActionSheet from '../ActionSheet'
import { useNotificationsStore } from '@/state/notifications'
import { useActivityUnreadStore } from '@/store/activityUnread'
import { NotificationsList } from './NotificationsList'
import { DESK_RING, type DeskAgent } from '@/lib/desk/threadModel'
import { useDeskSpeakerStore } from '@/store/deskSpeaker'
import { useDeskFocusStore } from '@/store/deskFocus'
import { subscribeToActivityEvents } from '@/lib/activity/activityEvents'
import { formatSastShortDayLabel } from '@/lib/routing/routingTime'
import type { ActivityItem } from '@/store/activity'
import {
  admin_exitDeskPlan,
  admin_getConversionRoutingStatus,
  type ConversionRoutingSummary,
} from '@/lib/transactions/clientFunctions'
import { useDeskPlanStore } from '@/store/deskPlan'
import { resetDeskRevealForLiveRestore } from '@/lib/desk/useProgressiveReveal'
import { useAuthStore } from '@/store/auth'
import { SpeakerAvatar } from './SpeakerAvatar'
import listStyles from '../Inbox/FinancialInboxListSheet.module.css'

/** One Planned→live restore per page load; mid-session Next 24h must survive desk close/open. */
let plannedExitOnPageLoadDone = false

/** Ring slot for each agent: the active one sits in front; the others retain their order behind. */
const SLOT_CLASS = [listStyles.deskSlotTop, listStyles.deskSlotLeft, listStyles.deskSlotRight] as const

function slotFor(agent: DeskAgent, active: DeskAgent): string {
  const offset = (DESK_RING.indexOf(agent) - DESK_RING.indexOf(active) + DESK_RING.length) % DESK_RING.length
  return SLOT_CLASS[offset]
}

export default function NotificationsSheet() {
  const { isNotificationsOpen, closeNotifications } = useNotificationsStore()
  const isAuthed = useAuthStore((s) => s.isAuthed)
  const active = useDeskSpeakerStore((s) => s.active)
  const focusAt = useDeskFocusStore((s) => s.focusAt)
  const applyPlanSummary = useDeskPlanStore((s) => s.applySummary)
  const setLive = useDeskPlanStore((s) => s.setLive)
  const [remoteItems, setRemoteItems] = useState<ActivityItem[]>([])
  const [, setSummary] = useState<ConversionRoutingSummary | null>(null)
  const headerDate = formatSastShortDayLabel(focusAt ?? Date.now())

  // Keep the feed warm while the sheet is closed, so opening the desk is immediate.
  useEffect(() => {
    if (!isAuthed) {
      setRemoteItems([])
      return
    }
    return subscribeToActivityEvents(setRemoteItems)
  }, [isAuthed])

  useEffect(() => {
    if (!isNotificationsOpen) return
    useActivityUnreadStore.getState().markSeen()
    window.scrollTo(0, 0)
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  }, [isNotificationsOpen])

  // On first desk open after a hard refresh, drop last session's Planned sim.
  // This runs behind the already-visible feed; it must never gate desk content.
  useEffect(() => {
    if (!isNotificationsOpen || !isAuthed) return
    let cancelled = false
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
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isNotificationsOpen, isAuthed, applyPlanSummary, setLive])

  useEffect(() => {
    if (!isNotificationsOpen || !isAuthed) return
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
    const timer = window.setInterval(load, 20_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [isNotificationsOpen, isAuthed, applyPlanSummary])

  return (
    <ActionSheet
      open={isNotificationsOpen}
      onClose={closeNotifications}
      title=""
      size="tall"
      className={`${listStyles.financialInboxSheet} inboxTallSheet`}
    >
      <div className={`${listStyles.content} ${listStyles.activityContent} ${listStyles.deskContent}`}>
        <div className={listStyles.deskHeaderChrome} aria-hidden />
        <div className={listStyles.activitySearchOverlay}>
          <div className={listStyles.deskHeader}>
            <div className={listStyles.deskTeamStack} aria-hidden>
              {DESK_RING.map((id) => (
                <div key={id} className={`${listStyles.deskStackFace} ${slotFor(id, active)}`}>
                  <SpeakerAvatar agent={id} size={id === active ? 56 : 40} speaking={id === active} />
                </div>
              ))}
            </div>
            <p className={listStyles.deskHeaderDate}>{headerDate}</p>
          </div>
        </div>
        {isAuthed ? <NotificationsList prefetchedItems={remoteItems} /> : null}
      </div>
    </ActionSheet>
  )
}

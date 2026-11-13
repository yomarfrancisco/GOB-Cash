'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import ActionSheet from '../ActionSheet'
import { useNotificationsStore } from '@/state/notifications'
import { useActivityUnreadStore } from '@/store/activityUnread'
import { NotificationsList } from './NotificationsList'
import { subscribeToActivityEvents } from '@/lib/activity/activityEvents'
import type { ActivityItem } from '@/store/activity'
import {
  admin_exitDeskPlan,
  admin_getConversionRoutingStatus,
  type ConversionRoutingSummary,
} from '@/lib/transactions/clientFunctions'
import { useDeskPlanStore } from '@/store/deskPlan'
import { resetDeskRevealForLiveRestore } from '@/lib/desk/useProgressiveReveal'
import { isDeskRevealHeld } from '@/lib/desk/deskRevealGate'
import { useAuthStore } from '@/store/auth'
import listStyles from '../Inbox/FinancialInboxListSheet.module.css'

/** One Planned→live restore per page load; mid-session Next 24h must survive desk close/open. */
let plannedExitOnPageLoadDone = false

export default function NotificationsSheet() {
  const { isNotificationsOpen, closeNotifications } = useNotificationsStore()
  const isAuthed = useAuthStore((s) => s.isAuthed)
  const applyPlanSummary = useDeskPlanStore((s) => s.applySummary)
  const setLive = useDeskPlanStore((s) => s.setLive)
  const [remoteItems, setRemoteItems] = useState<ActivityItem[]>([])
  const [, setSummary] = useState<ConversionRoutingSummary | null>(null)
  const [deskSessionKey, setDeskSessionKey] = useState(0)
  const wasOpenRef = useRef(false)

  // A normal desk open must seed history as already settled. Do not remount
  // the list here — on iPhone, remounting the full feed on every reopen OOMs.
  // Preserve the reveal queue only when the desk was temporarily closed by
  // its own keypad during an active live/planned sequence.
  useLayoutEffect(() => {
    const opening = isNotificationsOpen && !wasOpenRef.current
    if (opening && !isDeskRevealHeld()) {
      resetDeskRevealForLiveRestore()
    }
    wasOpenRef.current = isNotificationsOpen
  }, [isNotificationsOpen])

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
          setDeskSessionKey((key) => key + 1)
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
      className={`${listStyles.financialInboxSheet} ${listStyles.deskSheet} inboxTallSheet`}
    >
      <div className={`${listStyles.content} ${listStyles.activityContent} ${listStyles.deskContent}`}>
        <div className={listStyles.deskTopFade} aria-hidden />
        {isAuthed ? (
          <NotificationsList key={deskSessionKey} prefetchedItems={remoteItems} />
        ) : null}
      </div>
    </ActionSheet>
  )
}

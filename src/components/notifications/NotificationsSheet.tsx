'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import ActionSheet from '../ActionSheet'
import { useNotificationsStore } from '@/state/notifications'
import { useActivityUnreadStore } from '@/store/activityUnread'
import { NotificationsList } from './NotificationsList'
import { DESK_RING, DESK_TEAM, type DeskAgent } from '@/lib/desk/threadModel'
import { useDeskSpeakerStore, type DeskFloor } from '@/store/deskSpeaker'
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
import { isDeskRevealHeld } from '@/lib/desk/deskRevealGate'
import { useAuthStore } from '@/store/auth'
import { useUserProfileStore } from '@/store/userProfile'
import Avatar from '@/components/Avatar'
import { SpeakerAvatar } from './SpeakerAvatar'
import listStyles from '../Inbox/FinancialInboxListSheet.module.css'

/** One Planned→live restore per page load; mid-session Next 24h must survive desk close/open. */
let plannedExitOnPageLoadDone = false

/** Ring slot for each agent: the active one sits in front; the others retain their order behind. */
const SLOT_CLASS = [
  listStyles.deskSlotTop,
  listStyles.deskSlotLeft,
  listStyles.deskSlotRight,
  listStyles.deskSlotHidden,
] as const

function slotForAgent(agent: DeskAgent, floor: DeskFloor, active: DeskAgent): string {
  if (floor === 'you') {
    // User takes centre; current speaker slides left; next right; third parks hidden.
    const activeIdx = DESK_RING.indexOf(active)
    if (agent === active) return listStyles.deskSlotLeft
    if (agent === DESK_RING[(activeIdx + 1) % DESK_RING.length]) return listStyles.deskSlotRight
    return listStyles.deskSlotHidden
  }
  const offset =
    (DESK_RING.indexOf(agent) - DESK_RING.indexOf(floor) + DESK_RING.length) % DESK_RING.length
  return SLOT_CLASS[offset]
}

function slotForYou(floor: DeskFloor): string {
  return floor === 'you' ? listStyles.deskSlotTop : listStyles.deskSlotHidden
}

export default function NotificationsSheet() {
  const { isNotificationsOpen, closeNotifications } = useNotificationsStore()
  const isAuthed = useAuthStore((s) => s.isAuthed)
  const active = useDeskSpeakerStore((s) => s.active)
  const floor = useDeskSpeakerStore((s) => s.floor)
  const askProfile = useUserProfileStore((s) => s.profile)
  const focusAt = useDeskFocusStore((s) => s.focusAt)
  const headerCompactRaw = useDeskFocusStore((s) => s.headerCompact)
  const applyPlanSummary = useDeskPlanStore((s) => s.applySummary)
  const setLive = useDeskPlanStore((s) => s.setLive)
  const [remoteItems, setRemoteItems] = useState<ActivityItem[]>([])
  const [, setSummary] = useState<ConversionRoutingSummary | null>(null)
  const [deskSessionKey, setDeskSessionKey] = useState(0)
  const [reduceMotion, setReduceMotion] = useState(false)
  const wasOpenRef = useRef(false)
  const headerDate = formatSastShortDayLabel(focusAt ?? Date.now())
  const headerCompact = reduceMotion
    ? headerCompactRaw >= 0.5
      ? 1
      : 0
    : headerCompactRaw
  const showSlim = headerCompact > 0.02
  const showLarge = headerCompact < 0.98

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

  // Warm desk header faces while the sheet is closed so reopen paints them
  // from cache instead of waiting on the first Image fetch.
  useEffect(() => {
    if (typeof window === 'undefined') return
    for (const id of DESK_RING) {
      const src = DESK_TEAM[id].avatar
      if (!src) continue
      const img = new window.Image()
      img.decoding = 'async'
      img.src = src
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduceMotion(Boolean(mq.matches))
    sync()
    mq.addEventListener?.('change', sync)
    return () => mq.removeEventListener?.('change', sync)
  }, [])

  useEffect(() => {
    if (isNotificationsOpen) return
    useDeskFocusStore.getState().setHeaderCompact(0)
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
      className={`${listStyles.financialInboxSheet} inboxTallSheet`}
    >
      <div className={`${listStyles.content} ${listStyles.activityContent} ${listStyles.deskContent}`}>
        <div className={listStyles.deskHeaderChrome} aria-hidden />
        <div
          className={[
            listStyles.activitySearchOverlay,
            showSlim ? listStyles.activitySearchOverlayCompact : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={{ ['--desk-header-t' as string]: String(headerCompact) }}
        >
          {showLarge ? (
            <div
              className={listStyles.deskHeader}
              style={{ opacity: 1 - headerCompact }}
              aria-hidden={showSlim && headerCompact > 0.6}
            >
              <div className={listStyles.deskTeamStack} aria-hidden>
                {DESK_RING.map((id) => {
                  const speaking = floor !== 'you' && id === floor
                  return (
                    <div key={id} className={`${listStyles.deskStackFace} ${slotForAgent(id, floor, active)}`}>
                      <SpeakerAvatar
                        agent={id}
                        size={speaking ? 56 : 40}
                        speaking={speaking}
                        shape="circle"
                        priority
                      />
                    </div>
                  )
                })}
                <div className={`${listStyles.deskStackFace} ${slotForYou(floor)}`}>
                  <Avatar
                    avatarUrl={askProfile.avatarUrl || null}
                    name={askProfile.fullName}
                    handle={askProfile.userHandle}
                    email={askProfile.email}
                    size={floor === 'you' ? 56 : 40}
                    rounded={999}
                  />
                </div>
              </div>
              <p className={listStyles.deskHeaderDate}>{headerDate}</p>
            </div>
          ) : null}

          {showSlim ? (
            <div
              className={listStyles.deskHeaderSlim}
              style={{ opacity: headerCompact }}
              aria-hidden={!showSlim}
            >
              <div className={listStyles.deskSlimFaces} aria-hidden>
                {DESK_RING.map((id) => {
                  const speaking = floor !== 'you' && id === floor
                  return (
                    <div
                      key={id}
                      className={[
                        listStyles.deskSlimFace,
                        speaking ? listStyles.deskSlimFaceActive : listStyles.deskSlimFaceIdle,
                      ].join(' ')}
                    >
                      <SpeakerAvatar
                        agent={id}
                        size={speaking ? 36 : 28}
                        speaking={false}
                        shape="circle"
                        priority
                      />
                    </div>
                  )
                })}
              </div>
              <p className={listStyles.deskHeaderSlimDate}>{headerDate}</p>
            </div>
          ) : null}
        </div>
        {isAuthed ? (
          <NotificationsList key={deskSessionKey} prefetchedItems={remoteItems} />
        ) : null}
      </div>
    </ActionSheet>
  )
}

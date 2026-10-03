'use client'

import { useEffect, useState } from 'react'
import ActionSheet from '../ActionSheet'
import { useNotificationsStore } from '@/state/notifications'
import { useActivityUnreadStore } from '@/store/activityUnread'
import { NotificationsList } from './NotificationsList'
import { DESK_RING, DESK_TEAM, type DeskAgent } from '@/lib/desk/threadModel'
import { useDeskSpeakerStore } from '@/store/deskSpeaker'
import listStyles from '../Inbox/FinancialInboxListSheet.module.css'

const DESK_FACES = DESK_RING.map((id) => DESK_TEAM[id].avatar)

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
  const active = useDeskSpeakerStore((s) => s.active)
  const speaker = DESK_TEAM[active]

  useEffect(() => {
    if (!isNotificationsOpen) return
    useActivityUnreadStore.getState().markSeen()
    window.scrollTo(0, 0)
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  }, [isNotificationsOpen])

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
            <p key={`${active}-name`} className={`${listStyles.deskHeaderName} ${listStyles.deskHeaderSwap}`}>
              {speaker.name}
            </p>
            <p key={`${active}-role`} className={`${listStyles.deskHeaderRole} ${listStyles.deskHeaderSwap}`}>
              {speaker.role}
            </p>
          </div>
        </div>
        <NotificationsList />
      </div>
    </ActionSheet>
  )
}

'use client'

import { useEffect, useState } from 'react'
import ActionSheet from '../ActionSheet'
import { useNotificationsStore } from '@/state/notifications'
import { useActivityUnreadStore } from '@/store/activityUnread'
import { NotificationsList } from './NotificationsList'
import { DESK_TEAM } from '@/lib/desk/threadModel'
import listStyles from '../Inbox/FinancialInboxListSheet.module.css'

const DESK_FACES = [DESK_TEAM.sam.avatar, DESK_TEAM.leo.avatar, DESK_TEAM.amina.avatar] as const

if (typeof window !== 'undefined') {
  DESK_FACES.forEach((src) => {
    const preload = new window.Image()
    preload.src = src
  })
}

function DeskFace({ src, className }: { src: string; className: string }) {
  const [ready, setReady] = useState(false)
  return (
    <div className={`${listStyles.deskStackFace} ${className}`}>
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
              <DeskFace src={DESK_TEAM.amina.avatar} className={listStyles.deskStackAmina} />
              <DeskFace src={DESK_TEAM.leo.avatar} className={listStyles.deskStackLeo} />
              <DeskFace src={DESK_TEAM.sam.avatar} className={listStyles.deskStackSam} />
            </div>
            <p className={listStyles.deskHeaderName}>{DESK_TEAM.sam.name}</p>
            <p className={listStyles.deskHeaderRole}>{DESK_TEAM.sam.role}</p>
          </div>
        </div>
        <NotificationsList />
      </div>
    </ActionSheet>
  )
}

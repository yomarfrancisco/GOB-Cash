'use client'

import { useEffect } from 'react'
import Image from 'next/image'
import ActionSheet from '../ActionSheet'
import { useNotificationsStore } from '@/state/notifications'
import { useActivityUnreadStore } from '@/store/activityUnread'
import { NotificationsList } from './NotificationsList'
import { DESK_TEAM } from '@/lib/desk/threadModel'
import listStyles from '../Inbox/FinancialInboxListSheet.module.css'

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
        <div className={listStyles.activitySearchOverlay}>
          <div className={listStyles.deskHeader}>
            <div className={listStyles.deskTeamStack} aria-hidden>
              <div className={`${listStyles.deskStackFace} ${listStyles.deskStackAmina}`}>
              <Image src={DESK_TEAM.amina.avatar} alt="" width={40} height={40} unoptimized />
            </div>
            <div className={`${listStyles.deskStackFace} ${listStyles.deskStackLeo}`}>
              <Image src={DESK_TEAM.leo.avatar} alt="" width={40} height={40} unoptimized />
            </div>
            <div className={`${listStyles.deskStackFace} ${listStyles.deskStackSam}`}>
              <Image src={DESK_TEAM.sam.avatar} alt="" width={48} height={48} unoptimized />
              </div>
            </div>
            <p className={listStyles.deskHeaderName}>{DESK_TEAM.sam.name}</p>
            <p className={listStyles.deskHeaderRole}>{DESK_TEAM.sam.role}</p>
          </div>
        </div>
        <div className={listStyles.conversationList} data-desk-feed>
          <NotificationsList />
        </div>
      </div>
    </ActionSheet>
  )
}

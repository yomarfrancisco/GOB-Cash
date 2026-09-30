'use client'

/**
 * E0 desk thread — visual twin of Ygor’s desk chat.
 * Fixture-only; no production reads/writes, no Accept/Wait/Execute.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  E0_FIXTURE_MOMENTS,
  E0_ISOLATION,
  formatControlAction,
  type E0Moment,
} from '@/lib/belief/e0Fixture'
import { DESK_RING, DESK_TEAM } from '@/lib/desk/threadModel'
import listStyles from '@/components/Inbox/FinancialInboxListSheet.module.css'
import activityStyles from '@/app/activity/activity.module.css'
import styles from './E0DeskThread.module.css'

const SLOT_CLASS = [listStyles.deskSlotTop, listStyles.deskSlotLeft, listStyles.deskSlotRight] as const

function DeskFace({ src, className }: { src: string; className: string }) {
  const [ready, setReady] = useState(false)
  return (
    <div className={`${listStyles.deskStackFace} ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className={ready ? listStyles.deskFaceReady : listStyles.deskFacePending}
        onLoad={() => setReady(true)}
      />
    </div>
  )
}

function MomentBubble({ moment, open, onToggle }: { moment: E0Moment; open: boolean; onToggle: () => void }) {
  return (
    <article className={styles.moment} data-moment={moment.id} data-e0-isolation={E0_ISOLATION.namespace}>
      <div className={styles.row}>
        <div className={styles.avatarWrap}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={DESK_TEAM.sam.avatar} alt="" className={styles.avatar} />
        </div>
        <div className={styles.bubble}>
          <div className={styles.speakerLine}>
            <span className={styles.speakerName}>{DESK_TEAM.sam.name}</span>
            <span className={styles.speakerRole}>{DESK_TEAM.sam.role}</span>
          </div>
          <p className={styles.title}>{moment.title}</p>
          <div className={styles.chips}>
            <span className={styles.chip} data-label={moment.label}>
              {moment.label}
            </span>
            <span className={styles.chipMuted}>Planner · {formatControlAction(moment.controlAction)}</span>
          </div>
          <p className={styles.samBody}>{moment.samBody}</p>
          <button type="button" className={styles.disclosure} onClick={onToggle} aria-expanded={open}>
            What changed?
          </button>
          {open ? <p className={styles.whatChanged}>{moment.whatChanged}</p> : null}
        </div>
      </div>
    </article>
  )
}

export default function E0DeskThread() {
  const feedRef = useRef<HTMLDivElement>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const moments = useMemo(() => E0_FIXTURE_MOMENTS, [])

  useEffect(() => {
    const feed = feedRef.current
    if (!feed) return
    // Start at the top so the seven-step fixture reads as a conversation from the beginning.
    feed.scrollTop = 0
  }, [moments.length])

  return (
    <div className="app-shell" data-e0-preview="true" data-e0-writes="false" data-e0-reads-prod="false">
      <div className={`mobile-frame ${styles.shell}`}>
      <div className={`${listStyles.content} ${listStyles.activityContent} ${styles.content}`}>
        <div className={listStyles.deskHeaderChrome} aria-hidden />
        <div className={listStyles.activitySearchOverlay}>
          <div className={listStyles.deskHeader}>
            <div className={listStyles.deskTeamStack} aria-hidden>
              {DESK_RING.map((id, index) => (
                <DeskFace key={id} src={DESK_TEAM[id].avatar} className={SLOT_CLASS[index]} />
              ))}
            </div>
            <p className={listStyles.deskHeaderName}>{DESK_TEAM.sam.name}</p>
            <p className={listStyles.deskHeaderRole}>E0 explain-only · fixture</p>
          </div>
        </div>

        <div className={listStyles.conversationList} data-desk-feed ref={feedRef}>
          <div className={`${activityStyles.activityContainer} ${activityStyles.deskFeed} ${styles.feed}`}>
            <p className={styles.banner}>
              Protected preview. Fixture only — no production evidence, no Accept or Wait.
            </p>
            {moments.map((moment) => (
              <MomentBubble
                key={moment.id}
                moment={moment}
                open={openId === moment.id}
                onToggle={() => setOpenId((cur) => (cur === moment.id ? null : moment.id))}
              />
            ))}
          </div>
        </div>

        <form
          className={listStyles.deskAskDock}
          onSubmit={(event) => {
            event.preventDefault()
          }}
        >
          <div className={activityStyles.replyFrame}>
            <textarea
              className={activityStyles.replyInput}
              rows={2}
              value=""
              placeholder="Ask Sam (read-only in E0)"
              disabled
              readOnly
              aria-label="Ask Sam (disabled in E0)"
            />
            <button type="button" className={activityStyles.replySend} disabled aria-label="Send disabled">
              ↑
            </button>
          </div>
          <p className={styles.dockNote}>Composer visible · muted · no mutations</p>
        </form>
      </div>
      </div>
    </div>
  )
}

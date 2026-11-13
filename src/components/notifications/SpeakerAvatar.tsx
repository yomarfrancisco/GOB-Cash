'use client'

import Image from 'next/image'
import type { DeskAgent } from '@/lib/desk/threadModel'
import { DESK_TEAM } from '@/lib/desk/threadModel'
import styles from './SpeakerAvatar.module.css'

const MONOGRAM: Record<DeskAgent, { text: string; fill: string }> = {
  sam: { text: 'RM', fill: 'var(--desk-mint, #9bdbc1)' },
  leo: { text: 'SA', fill: 'var(--desk-yellow, #ffd36b)' },
  amina: { text: 'MZ', fill: 'var(--desk-pink, #f4a6c4)' },
}

/** Prefer photo when present; otherwise token monogram. Used in header + message row. */
export function SpeakerAvatar({
  agent,
  size,
  speaking,
  className,
  priority = false,
  /** Header stack is circular; message-row faces stay rounded squares. */
  shape = 'rounded',
}: {
  agent: DeskAgent
  size: number
  speaking?: boolean
  className?: string
  /** Header faces should paint immediately on desk open. */
  priority?: boolean
  shape?: 'circle' | 'rounded'
}) {
  const who = DESK_TEAM[agent]
  const mono = MONOGRAM[agent]
  const usePhoto = Boolean(who.avatar)
  const px = Math.max(1, Math.round(size))
  return (
    <div
      className={[
        styles.wrap,
        shape === 'circle' ? styles.circle : '',
        speaking ? styles.speaking : '',
        className || '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ width: px, height: px }}
      aria-label={who.name}
    >
      {usePhoto ? (
        <Image
          src={who.avatar}
          alt=""
          fill
          sizes={`${px}px`}
          className={styles.img}
          unoptimized
          priority={priority}
          loading={priority ? 'eager' : undefined}
        />
      ) : (
        <span className={styles.mono} style={{ background: mono.fill, fontSize: px >= 56 ? 16 : px >= 40 ? 12 : 10 }}>
          {mono.text}
        </span>
      )}
    </div>
  )
}

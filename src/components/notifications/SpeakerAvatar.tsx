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
}: {
  agent: DeskAgent
  size: 40 | 44 | 56
  speaking?: boolean
  className?: string
  /** Header faces should paint immediately on desk open. */
  priority?: boolean
}) {
  const who = DESK_TEAM[agent]
  const mono = MONOGRAM[agent]
  const usePhoto = Boolean(who.avatar)
  return (
    <div
      className={[styles.wrap, speaking ? styles.speaking : '', className || ''].filter(Boolean).join(' ')}
      style={{ width: size, height: size }}
      aria-label={who.name}
    >
      {usePhoto ? (
        <Image
          src={who.avatar}
          alt=""
          fill
          sizes={`${size}px`}
          className={styles.img}
          unoptimized
          priority={priority}
          loading={priority ? 'eager' : undefined}
        />
      ) : (
        <span className={styles.mono} style={{ background: mono.fill, fontSize: size >= 56 ? 16 : 12 }}>
          {mono.text}
        </span>
      )}
    </div>
  )
}

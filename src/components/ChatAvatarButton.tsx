'use client'

import React from 'react'
import Image from 'next/image'
import { BabyCdoChatSheet } from './BabyCdoChatSheet'
import { useBabyCdoChatStore } from '@/state/babyCdoChat'
import styles from './ChatAvatarButton.module.css'

export function ChatAvatarButton() {
  const { open, openChat, close } = useBabyCdoChatStore()

  return (
    <>
      {/* Floating avatar button */}
      <button
        type="button"
        onClick={() => {
          if (open) {
            close()
          } else {
            openChat()
          }
        }}
        className={styles.fab}
        aria-label="Open BRICS chat"
      >
        <div className={styles.avatarInner}>
          <Image
            src="/assets/Brics-girl-blue.png"
            alt="BRICS fund manager"
            width={56}
            height={56}
            className={styles.avatarImage}
          />
        </div>
      </button>

      {/* BabyCDO chat sheet */}
      <BabyCdoChatSheet />
    </>
  )
}


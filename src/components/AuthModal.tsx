/**
 * AuthModal - Full-screen image takeover
 * 
 * Visual test: Shows only the background image in a full-screen ActionSheet.
 * All interactions trigger this single image sheet.
 * No forms, no buttons, no sign-in logic - just the image.
 */

'use client'

import Image from 'next/image'
import { useAuthStore } from '@/store/auth'
import ActionSheet from './ActionSheet'
import styles from './AuthModal.module.css'

export default function AuthModal() {
  const { authOpen, closeAuth } = useAuthStore()

  if (!authOpen) return null

  return (
    <ActionSheet open={authOpen} onClose={closeAuth} title="" size="tall" className={styles.fullscreenImageSheet}>
      <div className={styles.imageContainer}>
        <Image
          src="/assets/sign up - first contact.png"
          alt=""
          fill
          style={{ objectFit: 'contain' }}
          priority
          unoptimized
        />
      </div>
    </ActionSheet>
  )
}

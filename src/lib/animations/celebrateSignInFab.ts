'use client'

import { USER_PLACEHOLDER_AVATAR } from '@/lib/avatarAssets'
import { useAiFabHighlightStore } from '@/state/aiFabHighlight'

/** One celebration per signed-in uid until sign-out. */
let celebratedUid: string | null = null
let celebrateTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Temporary $ FAB avatar takeover after a successful interactive sign-in.
 * Same motion language as agent notification takeovers — brief, then clears.
 */
export function celebrateSignInFab(opts: {
  uid: string
  avatarUrl?: string | null
  delayMs?: number
  durationMs?: number
}): void {
  if (typeof window === 'undefined') return
  if (!opts.uid || celebratedUid === opts.uid) return
  celebratedUid = opts.uid

  if (celebrateTimer) {
    clearTimeout(celebrateTimer)
    celebrateTimer = null
  }

  const avatar =
    (typeof opts.avatarUrl === 'string' && opts.avatarUrl.trim()) || USER_PLACEHOLDER_AVATAR

  celebrateTimer = setTimeout(() => {
    celebrateTimer = null
    useAiFabHighlightStore.getState().triggerAiFabHighlight({
      reason: 'sign-in',
      avatar,
      durationMs: opts.durationMs ?? 3500,
    })
  }, opts.delayMs ?? 320)
}

/** Allow the next login for this session to celebrate again. */
export function clearSignInFabCelebration(): void {
  celebratedUid = null
  if (celebrateTimer) {
    clearTimeout(celebrateTimer)
    celebrateTimer = null
  }
}

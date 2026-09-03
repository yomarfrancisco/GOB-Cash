/**
 * AI FAB Highlight State
 * Manages the "AI takeover" animation on the bottom FAB button
 */

import { create } from 'zustand'

// Default avatar path for $ama (avoiding circular dependency with CHARACTERS)
const DEFAULT_AMA_AVATAR = '/assets/Brics-girl-blue.png'

export type AiFabHighlightState = {
  isHighlighted: boolean
  lastReason?: string
  lastAmountZar?: number
  lastAvatar?: string // Avatar path for the actor that triggered the highlight
  triggerAiFabHighlight: (meta?: {
    reason?: string
    amountZar?: number
    avatar?: string
    durationMs?: number
  }) => void
  clearAiFabHighlight: () => void
}

const HIGHLIGHT_DURATION_MS = 3500 // 3.5 seconds
let highlightTimer: ReturnType<typeof setTimeout> | null = null

function clearHighlightTimer() {
  if (highlightTimer) {
    clearTimeout(highlightTimer)
    highlightTimer = null
  }
}

export const useAiFabHighlightStore = create<AiFabHighlightState>((set) => ({
  isHighlighted: false,
  lastReason: undefined,
  lastAmountZar: undefined,
  lastAvatar: undefined,
  triggerAiFabHighlight: (meta) => {
    clearHighlightTimer()
    set((state) => ({
      isHighlighted: true,
      lastReason: meta?.reason ?? state.lastReason,
      lastAmountZar: meta?.amountZar ?? state.lastAmountZar,
      lastAvatar: meta?.avatar ?? state.lastAvatar ?? DEFAULT_AMA_AVATAR,
    }))

    highlightTimer = setTimeout(() => {
      highlightTimer = null
      set({ isHighlighted: false })
    }, meta?.durationMs ?? HIGHLIGHT_DURATION_MS)
  },
  clearAiFabHighlight: () => {
    clearHighlightTimer()
    set({ isHighlighted: false })
  },
}))

/**
 * Helper to determine if an AI trade should trigger the FAB highlight
 * For now: trades above R150 threshold are considered "highlight-worthy"
 */
export function shouldHighlightAiFab(amountZar?: number): boolean {
  if (!amountZar) return false
  return Math.abs(amountZar) > 150
}

/**
 * Helper to determine if a $ariel notification should trigger the FAB highlight.
 * Triggers for high-volume transactions (>= R45,000 in absolute value).
 */
export function shouldHighlightArielFab(
  actor?: { name?: string; type?: string },
  amountZar?: number
): boolean {
  if (!actor || actor.name !== '$ariel') return false
  if (typeof amountZar !== 'number') return false
  // High-volume threshold: |R45,000|+
  return Math.abs(amountZar) >= 45000
}


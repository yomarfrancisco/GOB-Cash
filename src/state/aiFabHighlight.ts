/**
 * AI FAB Highlight State
 * Manages the "AI takeover" animation on the bottom FAB button
 */

import { create } from 'zustand'
import { CHARACTERS } from '@/lib/demo/templates/characters'

export type AiFabHighlightState = {
  isHighlighted: boolean
  lastReason?: string
  lastAmountZar?: number
  lastAvatar?: string // Avatar path for the actor that triggered the highlight
  triggerAiFabHighlight: (meta?: { reason?: string; amountZar?: number; avatar?: string }) => void
}

const HIGHLIGHT_DURATION_MS = 3500 // 3.5 seconds

export const useAiFabHighlightStore = create<AiFabHighlightState>((set) => ({
  isHighlighted: false,
  lastReason: undefined,
  lastAmountZar: undefined,
  lastAvatar: undefined,
  triggerAiFabHighlight: (meta) => {
    set({
      isHighlighted: true,
      lastReason: meta?.reason,
      lastAmountZar: meta?.amountZar,
      lastAvatar: meta?.avatar ?? CHARACTERS.ama.avatar, // default to $ama
    })

    // Auto-reset after duration
    setTimeout(() => {
      set((state) => {
        // Only reset if this is still the current highlight
        if (state.isHighlighted) {
          return {
            isHighlighted: false,
            // Keep lastReason and lastAmountZar for potential future use
          }
        }
        return state
      })
    }, HIGHLIGHT_DURATION_MS)
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


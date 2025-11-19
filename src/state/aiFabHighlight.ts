/**
 * AI FAB Highlight State
 * Manages the "AI takeover" animation on the bottom FAB button
 */

import { create } from 'zustand'

export type AiFabHighlightState = {
  isHighlighted: boolean
  lastReason?: string
  lastAmountZar?: number
  triggerAiFabHighlight: (meta?: { reason?: string; amountZar?: number }) => void
}

const HIGHLIGHT_DURATION_MS = 3500 // 3.5 seconds

export const useAiFabHighlightStore = create<AiFabHighlightState>((set) => ({
  isHighlighted: false,
  lastReason: undefined,
  lastAmountZar: undefined,
  triggerAiFabHighlight: (meta) => {
    set({
      isHighlighted: true,
      lastReason: meta?.reason,
      lastAmountZar: meta?.amountZar,
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


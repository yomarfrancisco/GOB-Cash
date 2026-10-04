import { create } from 'zustand'
import type { ConversionDestination } from '@/store/usePayIntoSheet'

export type RoutingPlayback = {
  destination: ConversionDestination
  amountZAR: number
  amountMZN: number
  testRunId?: string
  cycleNumber?: number
  /** deploy / replenish confirm the open desk card; mzn_fund only tops up the MZN wallet. */
  routingAction?: 'replenish' | 'deploy' | 'mzn_fund'
  /**
   * Catch-up / replay: animate the keypad then dismiss without submitting.
   * Live awaiting cards leave this unset so Sell confirms the open step.
   */
  playbackOnly?: boolean
}

type RoutingPlaybackState = {
  play: RoutingPlayback | null
  requestPlay: (play: RoutingPlayback) => void
  clear: () => void
}

export const useRoutingPlaybackStore = create<RoutingPlaybackState>((set) => ({
  play: null,
  requestPlay: (play) => set({ play }),
  clear: () => set({ play: null }),
}))

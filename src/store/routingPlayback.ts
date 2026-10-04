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

function sameRoutingPlay(a: RoutingPlayback, b: RoutingPlayback): boolean {
  return (
    a.destination === b.destination &&
    a.amountZAR === b.amountZAR &&
    a.amountMZN === b.amountMZN &&
    a.testRunId === b.testRunId &&
    a.cycleNumber === b.cycleNumber &&
    a.routingAction === b.routingAction &&
    Boolean(a.playbackOnly) === Boolean(b.playbackOnly)
  )
}

export const useRoutingPlaybackStore = create<RoutingPlaybackState>((set) => ({
  play: null,
  // Avoid remounting AmountSheet autoPlay when Next 24h and the card both open the same play.
  requestPlay: (play) =>
    set((state) => (state.play && sameRoutingPlay(state.play, play) ? state : { play })),
  clear: () => set({ play: null }),
}))

import { create } from 'zustand'

export type RoutingPlayback = {
  amountZAR: number
  testRunId?: string
  cycleNumber?: number
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

import { create } from 'zustand'
import type { ConversionDestination } from '@/store/usePayIntoSheet'

export type RoutingPlayback = {
  destination: ConversionDestination
  amountZAR: number
  amountMZN: number
  testRunId?: string
  cycleNumber?: number
  routingAction?: 'replenish' | 'deploy'
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

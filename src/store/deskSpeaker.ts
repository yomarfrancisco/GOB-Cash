import { create } from 'zustand'
import type { DeskAgent } from '@/lib/desk/threadModel'

/** Which desk agent has the floor. Set by the activity list, read by the desk header. */
type DeskSpeakerState = {
  active: DeskAgent
  setActive: (agent: DeskAgent) => void
}

export const useDeskSpeakerStore = create<DeskSpeakerState>((set) => ({
  active: 'sam',
  setActive: (agent) => set((state) => (state.active === agent ? state : { active: agent })),
}))

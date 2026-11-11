import { create } from 'zustand'
import type { DeskAgent } from '@/lib/desk/threadModel'

/** Who occupies the desk header centre — an agent, or the user briefly after a reply. */
export type DeskFloor = DeskAgent | 'you'

/** Which desk agent has the floor. Set by the activity list, read by the desk header. */
type DeskSpeakerState = {
  active: DeskAgent
  floor: DeskFloor
  setActive: (agent: DeskAgent) => void
  /** Briefly put the user avatar in the header centre (e.g. after Ask send). */
  flashYou: (ms?: number) => void
}

let youFlashToken = 0

export const useDeskSpeakerStore = create<DeskSpeakerState>((set, get) => ({
  active: 'sam',
  floor: 'sam',
  setActive: (agent) => {
    const state = get()
    if (state.active === agent && state.floor === agent) return
    if (state.floor === 'you') {
      // Keep user centred until the flash ends; still track the next agent.
      set({ active: agent })
      return
    }
    set({ active: agent, floor: agent })
  },
  flashYou: (ms = 1400) => {
    const token = ++youFlashToken
    set({ floor: 'you' })
    window.setTimeout(() => {
      if (token !== youFlashToken) return
      const active = get().active
      set({ floor: active })
    }, ms)
  },
}))

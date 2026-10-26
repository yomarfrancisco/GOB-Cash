import { create } from 'zustand'

type DeskModeActionsState = {
  planBusy: boolean
  setPlanBusy: (busy: boolean) => void
  next24h: (() => void) | null
  next72h: (() => void) | null
  realtime: (() => void) | null
  register: (handlers: {
    next24h: () => void
    next72h: () => void
    realtime: () => void
  }) => void
}

/** Bridge so the sticky desk header can fire Next 24h / 72h / Real time. */
export const useDeskModeActionsStore = create<DeskModeActionsState>((set) => ({
  planBusy: false,
  setPlanBusy: (busy) => set({ planBusy: busy }),
  next24h: null,
  next72h: null,
  realtime: null,
  register: (handlers) =>
    set((prev) => {
      if (
        prev.next24h === handlers.next24h &&
        prev.next72h === handlers.next72h &&
        prev.realtime === handlers.realtime
      ) {
        return prev
      }
      return {
        next24h: handlers.next24h,
        next72h: handlers.next72h,
        realtime: handlers.realtime,
      }
    }),
}))

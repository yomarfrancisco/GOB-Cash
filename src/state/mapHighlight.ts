/**
 * Map Highlight State
 * Manages temporary map panning and marker highlighting for notifications
 */

import { create } from 'zustand'

export type MapHighlight = {
  lat: number
  lng: number
  id: string
  kind: 'member' | 'co_op'
}

type MapHighlightState = {
  highlight: MapHighlight | null
  highlightOnMap: (highlight: MapHighlight) => void
  clearMapHighlight: () => void
}

export const useMapHighlightStore = create<MapHighlightState>((set) => ({
  highlight: null,
  highlightOnMap: (highlight) => {
    set({ highlight })
    
    // Auto-clear after 3-4 seconds
    setTimeout(() => {
      set((state) => {
        // Only clear if this is still the current highlight
        if (state.highlight?.id === highlight.id) {
          return { highlight: null }
        }
        return state
      })
    }, 3500)
  },
  clearMapHighlight: () => set({ highlight: null }),
}))


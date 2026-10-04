/**
 * Pause/resume the desk progressive-reveal pump while the conversion keypad
 * is on screen (catch-up closes the sheet; reveal state must not race ahead).
 */
type Listener = () => void

let held = false
const listeners = new Set<Listener>()

export function holdDeskReveal(): void {
  held = true
}

export function releaseDeskReveal(): void {
  if (!held) return
  held = false
  for (const listener of Array.from(listeners)) listener()
}

export function isDeskRevealHeld(): boolean {
  return held
}

export function onDeskRevealRelease(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

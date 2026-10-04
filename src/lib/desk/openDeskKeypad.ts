import { holdDeskReveal, releaseDeskReveal } from '@/lib/desk/deskRevealGate'
import { useNotificationsStore } from '@/state/notifications'
import { useRoutingPlaybackStore, type RoutingPlayback } from '@/store/routingPlayback'

/**
 * Pop the conversion keypad over a closed desk. AmountSheet watches
 * routingPlayback and opens; on dismiss/submit the desk is restored.
 */
export function openDeskKeypad(play: RoutingPlayback): void {
  holdDeskReveal()
  // Set play before closing the desk so auto-submit never races a null play
  // (null play was falling through to capitalShock → "Conversion failed").
  useRoutingPlaybackStore.getState().requestPlay(play)
  useNotificationsStore.getState().closeNotifications()
}

/** Cancel/dismiss path: clear play and bring the desk back after the keypad animates out. */
export function resumeDeskAfterKeypad(): void {
  useRoutingPlaybackStore.getState().clear()
  window.setTimeout(() => {
    useNotificationsStore.getState().openNotifications()
    // Resume catch-up after the desk sheet remounts.
    window.setTimeout(() => releaseDeskReveal(), 40)
  }, 220)
}

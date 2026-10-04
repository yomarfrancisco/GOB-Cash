import { holdDeskReveal, releaseDeskReveal } from '@/lib/desk/deskRevealGate'
import { useNotificationsStore } from '@/state/notifications'
import { useRoutingPlaybackStore, type RoutingPlayback } from '@/store/routingPlayback'

/**
 * Pop the conversion keypad over a closed desk. AmountSheet watches
 * routingPlayback and opens; on dismiss/submit the desk is restored.
 */
export function openDeskKeypad(play: RoutingPlayback): void {
  holdDeskReveal()
  useNotificationsStore.getState().closeNotifications()
  // Let the sheet start closing before the keypad mounts so the pop-in is visible.
  window.setTimeout(() => {
    useRoutingPlaybackStore.getState().requestPlay(play)
  }, 180)
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

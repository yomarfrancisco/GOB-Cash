import { holdDeskReveal, releaseDeskReveal } from '@/lib/desk/deskRevealGate'
import { isConversionInFlight } from '@/lib/transactions/submitInternalConversion'
import { useNotificationsStore } from '@/state/notifications'
import { useRoutingPlaybackStore, type RoutingPlayback } from '@/store/routingPlayback'

/** One auto keypad offer per card / cycle action (dismiss does not re-pop; button still works). */
const deskKeypadAutoOffered = new Set<string>()

export function routingKeypadOfferKey(play: {
  testRunId?: string
  cycleNumber?: number
  routingAction?: RoutingPlayback['routingAction']
}): string | null {
  if (!play.testRunId || typeof play.cycleNumber !== 'number' || !play.routingAction) return null
  return `${play.testRunId}:${play.cycleNumber}:${play.routingAction}`
}

export function markDeskKeypadOffered(key: string | null | undefined): void {
  if (key) deskKeypadAutoOffered.add(key)
}

export function wasDeskKeypadOffered(key: string | null | undefined): boolean {
  return Boolean(key && deskKeypadAutoOffered.has(key))
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

/**
 * Pop the conversion keypad over a closed desk. AmountSheet watches
 * routingPlayback and opens; on dismiss/submit the desk is restored.
 * Returns false when a matching play is already up or a conversion is in flight.
 */
export function openDeskKeypad(play: RoutingPlayback): boolean {
  if (isConversionInFlight()) return false
  const current = useRoutingPlaybackStore.getState().play
  if (current && sameRoutingPlay(current, play)) return false

  // Mark before open so card auto-open cannot race a second keypad after desk restore.
  markDeskKeypadOffered(routingKeypadOfferKey(play))

  holdDeskReveal()
  // Set play before closing the desk so auto-submit never races a null play
  // (null play was falling through to capitalShock → "Conversion failed").
  useRoutingPlaybackStore.getState().requestPlay(play)
  useNotificationsStore.getState().closeNotifications()
  return true
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

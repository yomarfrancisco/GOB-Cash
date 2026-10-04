import { releaseDeskReveal } from '@/lib/desk/deskRevealGate'
import { admin_confirmConversionRoutingCycle } from '@/lib/transactions/clientFunctions'
import { submitInternalConversion } from '@/lib/transactions/submitInternalConversion'
import { useRoutingPlaybackStore } from '@/store/routingPlayback'
import { useNotificationsStore } from '@/state/notifications'

export async function submitRoutingConversion(params: {
  amountZAR: number
  amountMZN: number
  play?: ReturnType<typeof useRoutingPlaybackStore.getState>['play']
}): Promise<void> {
  const play = params.play || useRoutingPlaybackStore.getState().play
  const destination = play?.destination || 'MZN'
  const fundMznOnly = play?.routingAction === 'mzn_fund'
  // The keypad converts the other leg at the live rate. A restock types the
  // card's MZN and would submit a ZAR figure that no longer matches the frozen
  // tickets. When the typed source is still the card's source, send the card.
  const restock = destination === 'ZAR' || play?.routingAction === 'replenish'
  const typedSource = restock ? params.amountMZN : params.amountZAR
  const cardSource = restock ? play?.amountMZN : play?.amountZAR
  const cardUntouched =
    !play ||
    !(cardSource && cardSource > 0) ||
    Math.abs(typedSource - cardSource) <= 0.02
  const amountZAR = play && cardUntouched && play.amountZAR > 0 ? play.amountZAR : params.amountZAR
  const amountMZN = play && cardUntouched && play.amountMZN > 0 ? play.amountMZN : params.amountMZN
  const action =
    play?.routingAction === 'replenish' || play?.routingAction === 'deploy'
      ? play.routingAction
      : destination === 'ZAR'
        ? ('replenish' as const)
        : ('deploy' as const)
  const routingPlay =
    !fundMznOnly && play?.testRunId && typeof play.cycleNumber === 'number'
      ? {
          testRunId: play.testRunId,
          cycleNumber: play.cycleNumber,
          action,
        }
      : null
  if (play) {
    // Keypad already called onClose. Restore the desk only after a short beat so
    // the sheet finishes dismissing before bubbles resume.
    useRoutingPlaybackStore.getState().clear()
    await new Promise((resolve) => setTimeout(resolve, 220))
    useNotificationsStore.getState().openNotifications()
    window.setTimeout(() => releaseDeskReveal(), 40)
  }
  const result = await submitInternalConversion({
    destination,
    amountMZN,
    amountZAR,
    routingPlay,
    // Desk keypad already has the step card — do not also post CONVERSION_INSTRUCTED / POP toasts.
    suppressDeskActivity: true,
  })
  if (routingPlay && play) {
    await admin_confirmConversionRoutingCycle({
      testRunId: routingPlay.testRunId,
      cycleNumber: routingPlay.cycleNumber,
      conversionTxId: result.txId,
      // Admin continuity: keypad confirm must not re-hit the swipe clock.
      overrideEarliest: true,
    })
  }
}

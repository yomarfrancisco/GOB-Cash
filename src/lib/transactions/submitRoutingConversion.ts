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
  const routingPlay =
    play?.testRunId && typeof play.cycleNumber === 'number'
      ? {
          testRunId: play.testRunId,
          cycleNumber: play.cycleNumber,
          action: play.routingAction || (destination === 'ZAR' ? ('replenish' as const) : ('deploy' as const)),
        }
      : null
  if (play) {
    // The keypad is already closing. Bring the desk back now, and let the
    // conversion and the next card arrive into it. Waiting for the server
    // left the profile sitting there for seconds, and a failed confirm
    // never reopened the desk at all.
    useRoutingPlaybackStore.getState().clear()
    useNotificationsStore.getState().openNotifications()
  }
  const result = await submitInternalConversion({
    destination,
    amountMZN,
    amountZAR,
    routingPlay,
  })
  if (play) {
    await admin_confirmConversionRoutingCycle({
      testRunId: play.testRunId,
      cycleNumber: play.cycleNumber,
      conversionTxId: result.txId,
    })
  }
}

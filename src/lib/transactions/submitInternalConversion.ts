import { formatMZN, formatZARWithDot } from '@/lib/money'
import { conversionAvatar, TASK_AVATARS } from '@/lib/activity/taskAvatars'
import { DESK_TEAM } from '@/lib/desk/threadModel'
import { useNotificationStore } from '@/store/notifications'
import { useAiFabHighlightStore } from '@/state/aiFabHighlight'
import { tx_createInternalConversion } from '@/lib/transactions/clientFunctions'
import type { ConversionDestination } from '@/store/usePayIntoSheet'
import { storyFromConversionResult } from '@/lib/animations/conversionStory'
import { requestConversionStory } from '@/lib/animations/conversionStoryBus'

let conversionInFlight = false

/** Overlay drop-in on the Exchange button (matches `.fab-content-overlay` 800ms). */
const FAB_DROP_MS = 850
const FAB_HOLD_MS = 4500

export function isConversionInFlight(): boolean {
  return conversionInFlight
}

export const CONVERSION_IN_FLIGHT_MESSAGE = 'Conversion already in progress.'

function waitRemaining(startedAt: number, minMs: number) {
  const remaining = minMs - (Date.now() - startedAt)
  if (remaining <= 0) return Promise.resolve()
  return new Promise<void>((resolve) => setTimeout(resolve, remaining))
}

export async function submitInternalConversion(params: {
  destination: ConversionDestination
  amountMZN: number
  amountZAR: number
  agentCash?: boolean
  agentCashHandle?: string | null
  capitalShock?: boolean
  routingPlay?: { testRunId: string; cycleNumber: number; action: 'deploy' | 'replenish' } | null
  /** Desk step already owns the narrative — skip conversion activity + POP toast. */
  suppressDeskActivity?: boolean
}): Promise<{
  txId: string
  capitalShock?: boolean
  enRoute?: boolean
  reserveInstantZar?: number
  reserveRoutedZar?: number
  reserveInstantMzn?: number
  reserveRoutedMzn?: number
  amountZar?: number
}> {
  if (conversionInFlight) {
    throw new Error(CONVERSION_IN_FLIGHT_MESSAGE)
  }
  conversionInFlight = true
  const sourceCurrency = params.destination === 'ZAR' ? 'MZN' : 'ZAR'
  const avatar = params.agentCash ? TASK_AVATARS.cashAgent : conversionAvatar(sourceCurrency)

  try {
    const sourceAmount = sourceCurrency === 'MZN' ? params.amountMZN : params.amountZAR
    const destAmount = sourceCurrency === 'MZN' ? params.amountZAR : params.amountMZN
    const conversionPromise = tx_createInternalConversion({
      sourceCurrency,
      destinationCurrency: params.destination,
      sourceAmount,
      destinationAmount: destAmount,
      agentCashHandle: params.agentCash ? params.agentCashHandle : null,
      capitalShock: params.capitalShock === true,
      routingPlay: params.routingPlay ?? null,
      suppressDeskActivity: params.suppressDeskActivity === true || Boolean(params.routingPlay),
    })

    // A desk play returns to the conversation immediately. The exchange-button
    // hold is for a keypad the user is staying on.
    const deskPlay = Boolean(params.routingPlay) || params.suppressDeskActivity === true
    const fabStartedAt = Date.now()
    if (!deskPlay) {
      await waitRemaining(Date.now(), 220)
      useAiFabHighlightStore.getState().triggerAiFabHighlight({
        reason: 'exchange',
        avatar,
        durationMs: FAB_HOLD_MS,
      })
    }

    const result = await conversionPromise
    if (!deskPlay) await waitRemaining(fabStartedAt, FAB_DROP_MS)

    const sourceLabel = sourceCurrency === 'MZN' ? formatMZN(sourceAmount) : formatZARWithDot(sourceAmount)
    const destLabel = params.destination === 'MZN' ? formatMZN(destAmount) : formatZARWithDot(destAmount)
    const isZarSale = sourceCurrency === 'ZAR'

    if (!deskPlay) {
      useAiFabHighlightStore.getState().triggerAiFabHighlight({
        reason: 'exchange',
        avatar,
        durationMs: FAB_HOLD_MS,
      })
    }

    const story = storyFromConversionResult({
      destination: params.destination,
      amountZAR: params.amountZAR,
      amountMZN: params.amountMZN,
      reserveInstantZar: result.reserveInstantZar,
      reserveRoutedZar: result.reserveRoutedZar,
      reserveInstantMzn: result.reserveInstantMzn,
      reserveRoutedMzn: result.reserveRoutedMzn,
      enRoute: result.enRoute,
    })
    requestConversionStory(story)

    if (result.capitalShock) {
      const who = DESK_TEAM.leo
      const instantZar = Number(result.reserveInstantZar || 0)
      const routedZar = Number(result.reserveRoutedZar || 0)
      const title =
        instantZar > 0 && !(routedZar > 0)
          ? 'ZAR paid from reserve'
          : instantZar > 0 && routedZar > 0
            ? 'ZAR split · reserve + ROUTE'
            : 'ZAR booked'
      const body =
        instantZar > 0 && !(routedZar > 0)
          ? `${sourceLabel} · paid out now from reserve.`
          : instantZar > 0 && routedZar > 0
            ? `${sourceLabel} · part paid now from reserve · remainder on ROUTE.`
            : isZarSale
              ? `${sourceLabel} booked until 09:00 next window. Day tickets are on $-Route.`
              : `${sourceLabel} sold · ${destLabel} clears ~09:00 next window.`
      useNotificationStore.getState().pushNotification({
        id: result.txId,
        kind: 'ai_trade',
        title,
        body,
        // Canonical desk card is the Firestore activityEvent.
        skipActivityStore: true,
        actor: {
          type: 'ai_manager',
          avatar: who.avatar,
          name: who.name,
        },
        routeOnTap: '/?desk=1',
      })
      return result
    }

    if (!deskPlay) {
      const who = isZarSale ? DESK_TEAM.leo : DESK_TEAM.amina
      useNotificationStore.getState().pushNotification({
        id: result.txId,
        kind: isZarSale ? 'ai_trade' : 'proof_of_payment',
        title: isZarSale ? 'ZAR booked' : 'ZAR sourced at COST',
        body: isZarSale
          ? `${sourceLabel} booked until 09:00 next window, then Moz inventory rises`
          : `${sourceLabel} to ${destLabel}`,
        amount: {
          currency: sourceCurrency,
          value: -sourceAmount,
        },
        direction: 'down',
        actor: {
          type: 'ai_manager',
          avatar: who.avatar,
          name: who.name,
        },
        routeOnTap: '/?desk=1',
      })
    }

    return result
  } catch (error) {
    useAiFabHighlightStore.getState().clearAiFabHighlight()
    throw error
  } finally {
    conversionInFlight = false
  }
}

import { formatMZN, formatZARWithDot } from '@/lib/money'
import { conversionAvatar, TASK_AVATARS } from '@/lib/activity/taskAvatars'
import { useNotificationStore } from '@/store/notifications'
import { useAiFabHighlightStore } from '@/state/aiFabHighlight'
import { tx_createInternalConversion } from '@/lib/transactions/clientFunctions'
import type { ConversionDestination } from '@/store/usePayIntoSheet'

let conversionInFlight = false

/** Overlay drop-in on the Exchange button (matches `.fab-content-overlay` 800ms). */
const FAB_DROP_MS = 850
const FAB_HOLD_MS = 4500

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
}): Promise<{ txId: string }> {
  if (conversionInFlight) {
    throw new Error('Conversion already in progress.')
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
    })

    await waitRemaining(Date.now(), 220)
    const fabStartedAt = Date.now()
    useAiFabHighlightStore.getState().triggerAiFabHighlight({
      reason: 'exchange',
      avatar,
      durationMs: FAB_HOLD_MS,
    })

    const result = await conversionPromise
    await waitRemaining(fabStartedAt, FAB_DROP_MS)

    const sourceLabel = sourceCurrency === 'MZN' ? formatMZN(sourceAmount) : formatZARWithDot(sourceAmount)
    const destLabel = params.destination === 'MZN' ? formatMZN(destAmount) : formatZARWithDot(destAmount)
    const isZarSale = sourceCurrency === 'ZAR'

    useAiFabHighlightStore.getState().triggerAiFabHighlight({
      reason: 'exchange',
      avatar,
      durationMs: FAB_HOLD_MS,
    })

    useNotificationStore.getState().pushNotification({
      id: result.txId,
      kind: 'proof_of_payment',
      title: isZarSale ? 'ZAR sold at SELL' : 'ZAR sourced at COST',
      body: `${sourceLabel} to ${destLabel}`,
      amount: {
        currency: sourceCurrency,
        value: -sourceAmount,
      },
      direction: 'down',
      actor: {
        type: 'ai_manager',
        avatar,
        name: 'Ama',
      },
      routeOnTap: '/profile?activity=1',
    })

    return result
  } catch (error) {
    useAiFabHighlightStore.getState().clearAiFabHighlight()
    throw error
  } finally {
    conversionInFlight = false
  }
}

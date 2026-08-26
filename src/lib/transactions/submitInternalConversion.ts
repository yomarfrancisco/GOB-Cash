import { formatMZN, formatZARWithDot } from '@/lib/money'
import { useNotificationStore } from '@/store/notifications'
import { tx_createInternalConversion } from '@/lib/transactions/clientFunctions'
import type { ConversionDestination } from '@/store/usePayIntoSheet'

let conversionInFlight = false

export async function submitInternalConversion(params: {
  destination: ConversionDestination
  amountMZN: number
  amountZAR: number
}): Promise<{ txId: string }> {
  if (conversionInFlight) {
    throw new Error('Conversion already in progress.')
  }
  conversionInFlight = true
  try {
    const sourceCurrency = params.destination === 'ZAR' ? 'MZN' : 'ZAR'
    const sourceAmount = sourceCurrency === 'MZN' ? params.amountMZN : params.amountZAR
    const destAmount = sourceCurrency === 'MZN' ? params.amountZAR : params.amountMZN
    const result = await tx_createInternalConversion({
      sourceCurrency,
      destinationCurrency: params.destination,
      sourceAmount,
    })

    const sourceLabel = sourceCurrency === 'MZN' ? formatMZN(sourceAmount) : formatZARWithDot(sourceAmount)
    const destLabel = params.destination === 'MZN' ? formatMZN(destAmount) : formatZARWithDot(destAmount)

    useNotificationStore.getState().pushNotification({
      id: result.txId,
      kind: 'proof_of_payment',
      title: 'Conversion instructed',
      body: `${sourceLabel} → ${destLabel} · pending confirmation`,
      amount: {
        currency: sourceCurrency,
        value: -sourceAmount,
      },
      direction: 'down',
      actor: {
        type: 'ai_manager',
        avatar: '/assets/Brics-girl-blue.png',
        name: 'Ama',
      },
      routeOnTap: '/profile?activity=1',
    })

    return result
  } finally {
    conversionInFlight = false
  }
}

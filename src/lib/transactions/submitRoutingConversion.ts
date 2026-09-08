import { admin_confirmConversionRoutingCycle } from '@/lib/transactions/clientFunctions'
import { submitInternalConversion } from '@/lib/transactions/submitInternalConversion'
import { useRoutingPlaybackStore } from '@/store/routingPlayback'

export async function submitRoutingConversion(params: {
  amountZAR: number
  amountMZN: number
}): Promise<void> {
  const play = useRoutingPlaybackStore.getState().play
  const destination = play?.destination || 'MZN'
  const result = await submitInternalConversion({
    destination,
    amountMZN: params.amountMZN,
    amountZAR: params.amountZAR,
  })
  if (play) {
    await admin_confirmConversionRoutingCycle({
      testRunId: play.testRunId,
      cycleNumber: play.cycleNumber,
      conversionTxId: result.txId,
    })
    useRoutingPlaybackStore.getState().clear()
  }
}

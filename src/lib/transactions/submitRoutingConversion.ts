import { admin_confirmConversionRoutingCycle } from '@/lib/transactions/clientFunctions'
import { submitInternalConversion } from '@/lib/transactions/submitInternalConversion'
import { useRoutingPlaybackStore } from '@/store/routingPlayback'

export async function submitRoutingConversion(params: {
  amountZAR: number
  amountMZN: number
}): Promise<void> {
  await submitInternalConversion({
    destination: 'MZN',
    amountMZN: params.amountMZN,
    amountZAR: params.amountZAR,
  })
  const play = useRoutingPlaybackStore.getState().play
  if (play) {
    await admin_confirmConversionRoutingCycle({
      testRunId: play.testRunId,
      cycleNumber: play.cycleNumber,
    })
    useRoutingPlaybackStore.getState().clear()
  }
}

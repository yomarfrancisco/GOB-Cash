/**
 * When a treasury reserve balance increases (admin inject / refill), drain the
 * EN_ROUTE queue FCFS so waiting tickets can settle early from the new liquidity.
 */

import * as functions from 'firebase-functions'
import { drainEnRouteQueueFromReserve, type ReserveCurrency } from './reserveConvert'

function currencyFromDocId(id: string): ReserveCurrency | null {
  if (id === 'zarReserve') return 'ZAR'
  if (id === 'mznReserve') return 'MZN'
  return null
}

export const onTreasuryReserveWrite = functions
  .region('us-central1')
  .firestore.document('treasury/{reserveId}')
  .onWrite(async (change, context) => {
    const currency = currencyFromDocId(String(context.params.reserveId || ''))
    if (!currency) return null

    const before = change.before.exists ? Number(change.before.data()?.fiatBalance || 0) : 0
    const after = change.after.exists ? Number(change.after.data()?.fiatBalance || 0) : 0
    if (!(after > before + 0.001)) return null

    try {
      const n = await drainEnRouteQueueFromReserve(currency, 40)
      console.log('[onTreasuryReserveWrite] drained', { currency, n, before, after })
    } catch (error) {
      console.warn('[onTreasuryReserveWrite] drain failed', {
        currency,
        error: error instanceof Error ? error.message : String(error),
      })
    }
    return null
  })

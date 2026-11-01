/**
 * Re-seed Buy ZAR Steps 1–3 for the latest buy_zar narrative so Moz/SA banks + liaisons show.
 * Usage: npx tsx scripts/reseedBuyZarDeskDay.ts [userId]
 */
import * as admin from 'firebase-admin'
import { seedBuyZarDeskDay } from '../src/tx/buyZarDeskDay'

admin.initializeApp({ projectId: 'gobankless-dev' })
const db = admin.firestore()

async function main() {
  const userId = process.argv[2]
  if (!userId) {
    console.error('Usage: npx tsx scripts/reseedBuyZarDeskDay.ts <userId>')
    process.exit(1)
  }

  const snap = await db
    .collection('users')
    .doc(userId)
    .collection('activityEvents')
    .where('narrative', '==', 'buy_zar')
    .limit(50)
    .get()

  const byTx = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>()
  for (const doc of snap.docs) {
    const data = doc.data()
    const txId = String(data.txId || data.buyDayId || '')
    if (!txId) continue
    if (Number(data.deskStep) !== 3) continue
    byTx.set(txId, doc)
  }

  if (byTx.size === 0) {
    console.log('No buy_zar Step 3 events found')
    return
  }

  for (const [txId, doc] of byTx) {
    const data = doc.data()
    const amountZar = Number(data.amountValue || 0)
    const amountMzn = Number(data.pairedAmountValue || 0)
    const costRate = amountZar > 0 ? amountMzn / amountZar : 0
    const sellRate = costRate > 0 ? costRate * 1.1 : 0
    const settleAtMs =
      typeof data.settleAtMs === 'number'
        ? data.settleAtMs
        : Date.now() + 12 * 60 * 60 * 1000
    console.log('Reseeding', { txId, amountZar, amountMzn, costRate })
    await seedBuyZarDeskDay({
      userId,
      txId,
      amountMzn,
      amountZar,
      costRate,
      sellRate,
      settleAtMs,
    })
  }
  console.log('Done', byTx.size)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

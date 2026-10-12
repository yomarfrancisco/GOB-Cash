/**
 * Supersede all active desk sims, cancel stray awaiting cards, open a fresh
 * R619.7k month run under the mature prospective book.
 */
import * as admin from 'firebase-admin'
import { ROUTING_ADMIN_UID } from '../src/routing/conversionRouter'

const PROJECT = 'gobankless-dev'
const CONVERSION_ROUTING_KIND = 'conversion_routing'

if (!admin.apps.length) {
  admin.initializeApp({ projectId: PROJECT })
}
const db = admin.firestore()
const uid = ROUTING_ADMIN_UID

async function cancelAwaiting(match?: (testRunId: string) => boolean): Promise<number> {
  const now = admin.firestore.Timestamp.now()
  const strays = await db
    .collection('users')
    .doc(uid)
    .collection('activityEvents')
    .where('kind', '==', CONVERSION_ROUTING_KIND)
    .where('status', '==', 'awaiting_execution')
    .get()
  let n = 0
  for (const doc of strays.docs) {
    const prev = doc.data() || {}
    const testRunId = String(prev.testRunId || '')
    if (match && !match(testRunId)) continue
    await doc.ref.update({
      status: 'cancelled',
      awaitingConfirm: false,
      body: `${prev.body || ''}\nStatus: Cancelled`.replace(/\nStatus: Awaiting execution/, '\nStatus: Cancelled'),
      completedAt: now,
    })
    n += 1
  }
  return n
}

async function supersedeActiveTests(): Promise<number> {
  const now = admin.firestore.Timestamp.now()
  const snap = await db.collection('adminConversionTests').where('status', '==', 'active').get()
  let n = 0
  for (const doc of snap.docs) {
    await doc.ref.set({ status: 'superseded', updatedAt: now }, { merge: true })
    n += 1
  }
  return n
}

async function main() {
  const cancelledBefore = await cancelAwaiting()
  const superseded = await supersedeActiveTests()

  const { forceFreshDeskRun } = await import('../src/tx/adminConversionRouting')
  const { OPERATING_POLICY_V1 } = await import('../src/operatingCalendar/operatingPolicyV1')
  const { DESK_MONTH_TARGET_ZAR } = await import('../src/routing/deskMonth')

  const summary = await forceFreshDeskRun({
    capitalZar: DESK_MONTH_TARGET_ZAR,
    note: `Fresh sim · October R${DESK_MONTH_TARGET_ZAR} · max R${OPERATING_POLICY_V1.payment.maxAmountZar}`,
  })

  const testRunId = String(summary.testRunId || '')
  const cancelledStrays = await cancelAwaiting((id) => id !== testRunId)

  const t = await db.collection('adminConversionTests').doc(testRunId).get()
  const d = t.data() || {}
  const book = (d.throughputWindow?.snapshot?.book || {}) as Record<string, Array<{ amount: number }>>
  const day1 = book['1'] || []
  const invoiceCount = Object.values(book).reduce((n, tickets) => n + (tickets?.length || 0), 0)

  const events = await db
    .collection('users')
    .doc(uid)
    .collection('activityEvents')
    .where('testRunId', '==', testRunId)
    .get()
  const openCards = events.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }))
    .filter((x) => x.status === 'awaiting_execution' || x.awaitingConfirm === true)
    .map((x) => ({
      id: x.id,
      title: x.title,
      status: x.status,
      routingAction: x.routingAction,
      deskSpeaker: x.deskSpeaker,
    }))

  console.log(
    JSON.stringify(
      {
        ok: true,
        cancelledAwaitingBefore: cancelledBefore,
        supersededActiveTests: superseded,
        cancelledStraysAfter: cancelledStrays,
        summary,
        book: {
          invoiceCount,
          day1Count: day1.length,
          day1Zar: Math.round(day1.reduce((s, t) => s + t.amount, 0) * 100) / 100,
          day1Amounts: day1.map((t) => t.amount),
        },
        openCards,
        desk: {
          deskStep: d.deskStep,
          cyclePhase: d.cyclePhase,
          awaitingCycleNumber: d.awaitingCycleNumber,
          awaitingKind: d.awaitingKind,
          routingEngine: d.routingEngine,
          authorisedZar: d.authorisedZar ?? d.availableCapital,
        },
      },
      null,
      2
    )
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

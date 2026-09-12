/**
 * Writes the dated Case A/B fixtures into adminDeskTx / adminDeskReviews / adminDeskSnapshots.
 * Run from functions/: npx tsx src/routing/backfillHistoricalCases.script.ts
 */

import { execFileSync } from 'child_process'
import { createRequire } from 'module'
import path from 'path'
import * as admin from 'firebase-admin'
import { DESK_REVIEW_COLLECTION, DESK_SNAPSHOT_COLLECTION, DESK_TX_COLLECTION, omitUndefined } from './frictionHistory'
import { HISTORICAL_REVIEWS, HISTORICAL_TXS } from './historicalCases'
import { replayHistoricalCases } from './replayHistoricalCases'

async function initAdmin() {
  if (admin.apps.length) return
  const projectId = process.env.GCLOUD_PROJECT || 'gobankless-dev'
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const firebaseBin = execFileSync('which', ['firebase'], { encoding: 'utf8' }).trim()
    const toolsRoot = path.resolve(path.dirname(firebaseBin), '../lib/node_modules/firebase-tools/lib')
    const req = createRequire(path.join(toolsRoot, 'auth.js'))
    const { getGlobalDefaultAccount } = req('./auth') as { getGlobalDefaultAccount: () => { user: unknown; tokens: unknown } | undefined }
    const { getCredentialPathAsync } = req('./defaultCredentials') as {
      getCredentialPathAsync: (account: { user: unknown; tokens: unknown }) => Promise<string | undefined>
    }
    const account = getGlobalDefaultAccount()
    if (!account) throw new Error('firebase login required to backfill Firestore')
    const credPath = await getCredentialPathAsync(account)
    if (!credPath) throw new Error('could not materialize firebase application-default credentials')
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath
  }
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId,
  })
}

async function main() {
  await initAdmin()
  const db = admin.firestore()
  const batch = db.batch()
  const replay = replayHistoricalCases()
  const asOf = [...replay.caseA, ...replay.caseB]
  for (const row of HISTORICAL_TXS) {
    const snap = asOf.find((item) => item.transactionId === row.id)
    batch.set(db.collection(DESK_TX_COLLECTION).doc(row.id), {
      ...omitUndefined({
        ...row,
        proposalSnapshotId: snap?.proposalSnapshot.id,
        executionSnapshotId: snap?.executionSnapshot.id,
      } as unknown as Record<string, unknown>),
      backfilledAt: admin.firestore.FieldValue.serverTimestamp(),
    })
  }
  for (const row of HISTORICAL_REVIEWS) {
    batch.set(db.collection(DESK_REVIEW_COLLECTION).doc(row.id), {
      ...omitUndefined(row as unknown as Record<string, unknown>),
      backfilledAt: admin.firestore.FieldValue.serverTimestamp(),
    })
  }
  for (const row of asOf) {
    for (const snapshot of [row.proposalSnapshot, row.executionSnapshot]) {
      batch.set(db.collection(DESK_SNAPSHOT_COLLECTION).doc(snapshot.id), {
        ...omitUndefined(snapshot as unknown as Record<string, unknown>),
        backfilledAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    }
  }
  await batch.commit()
  console.log(
    JSON.stringify(
      {
        wrote: {
          txs: HISTORICAL_TXS.length,
          reviews: HISTORICAL_REVIEWS.length,
          snapshots: asOf.length * 2,
        },
        comparison: replay.comparison,
      },
      null,
      2
    )
  )
}

void main()

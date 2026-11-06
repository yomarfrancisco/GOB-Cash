/**
 * Seed shared treasury reserve books (idempotent merge of missing fields).
 *
 *   cd functions && npx ts-node --transpile-only scripts/seedTreasuryReserves.ts
 */
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as admin from 'firebase-admin'
import { RESERVE_DEFAULTS, reserveDocId } from '../src/treasury/reserveBooks'

const adcCandidates = [
  process.env.GOOGLE_APPLICATION_CREDENTIALS,
  path.join(os.homedir(), '.config/gcloud/application_default_credentials.json'),
  path.join(
    os.homedir(),
    '.config/firebase/ygor_francisco_gmail.com_application_default_credentials.json'
  ),
].filter(Boolean) as string[]
for (const adc of adcCandidates) {
  if (fs.existsSync(adc)) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = adc
    break
  }
}

if (!admin.apps.length) admin.initializeApp({ projectId: 'gobankless-dev' })
const db = admin.firestore()

async function seed(currency: 'ZAR' | 'MZN') {
  const ref = db.collection('treasury').doc(reserveDocId(currency))
  const snap = await ref.get()
  const defaults = RESERVE_DEFAULTS[currency]
  const now = admin.firestore.Timestamp.now()
  if (!snap.exists) {
    await ref.set({
      currency,
      fiatBalance: defaults.fiatBalance,
      targetBalance: defaults.targetBalance,
      createdAt: now,
      updatedAt: now,
    })
    return { currency, created: true, ...defaults }
  }
  const data = snap.data() || {}
  const patch: Record<string, unknown> = { updatedAt: now, currency }
  if (data.targetBalance == null) patch.targetBalance = defaults.targetBalance
  if (data.fiatBalance == null) patch.fiatBalance = defaults.fiatBalance
  if (Object.keys(patch).length > 2) await ref.set(patch, { merge: true })
  return {
    currency,
    created: false,
    fiatBalance: Number(data.fiatBalance ?? defaults.fiatBalance),
    targetBalance: Number(data.targetBalance ?? defaults.targetBalance),
  }
}

async function main() {
  const zar = await seed('ZAR')
  const mzn = await seed('MZN')
  console.log(JSON.stringify({ zar, mzn }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

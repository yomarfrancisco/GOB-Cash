/**
 * Zero MZN/ZAR wallets and clear first-payout / reserve-split desk rows for a user.
 *
 *   cd functions && npx tsx scripts/resetFirstPayoutTestUser.ts [uid]
 */
import * as admin from 'firebase-admin'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const adcCandidates = [
  process.env.GOOGLE_APPLICATION_CREDENTIALS,
  path.join(os.homedir(), '.config/gcloud/application_default_credentials.json'),
  path.join(
    os.homedir(),
    '.config/firebase/ygor_francisco_gmail.com_application_default_credentials.json'
  ),
].filter((value): value is string => Boolean(value))
for (const candidate of adcCandidates) {
  if (fs.existsSync(candidate)) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = candidate
    break
  }
}

admin.initializeApp({ projectId: 'gobankless-dev' })
const db = admin.firestore()

const uid = process.argv[2] || 'l4Ia5CPAxlTg39C9RhiA03qozlY2'

const DELETE_ROUTING_ACTIONS = new Set([
  'reserve_split',
  'bank_notice',
  'payout_details_request',
  'payout_details_received',
  'payout_confirmed',
  'daily_liquid_zar_payout',
  'instant_convert',
])

const DELETE_KINDS = new Set([
  'BANK_TRANSFER_CONFIRMED',
  'WITHDRAWAL_INSTRUCTED',
  'EXTERNAL_DEPOSIT_CONFIRMED',
  'DEPOSIT_CREDITED',
])

const DELETE_TITLE_RE =
  /ZAR paid from reserve|MZN paid from reserve|received|ZAR ready|SA account details|Full payout confirmed|Daily withdrawal/i

async function zeroWallet(walletId: string) {
  const ref = db.collection('users').doc(uid).collection('wallets').doc(walletId)
  const now = admin.firestore.FieldValue.serverTimestamp()
  await ref.set(
    {
      walletId,
      kind: 'cash',
      displayCurrency: walletId === 'cashZAR' ? 'ZAR' : 'MZN',
      fiatBalance: 0,
      usdtBalance: 0,
      firstPayoutHold: false,
      firstPayoutStatus: admin.firestore.FieldValue.delete(),
      firstPayoutHoldZar: admin.firestore.FieldValue.delete(),
      firstPayoutDetails: admin.firestore.FieldValue.delete(),
      liquidCycleAccruedZar: 0,
      updatedAt: now,
    },
    { merge: true }
  )
  console.log('zeroed', walletId)
}

async function main() {
  await zeroWallet('cashMZN')
  await zeroWallet('cashZAR')

  const events = db.collection('users').doc(uid).collection('activityEvents')
  const snap = await events.orderBy('createdAt', 'desc').limit(80).get()
  let deleted = 0
  for (const doc of snap.docs) {
    const data = doc.data() || {}
    const action = String(data.routingAction || '')
    const kind = String(data.kind || '')
    const title = String(data.title || '')
    const shouldDelete =
      DELETE_ROUTING_ACTIONS.has(action) ||
      DELETE_KINDS.has(kind) ||
      DELETE_TITLE_RE.test(title) ||
      /^mzn-recv-|^reserve-split-|^payout-|^bank-transfer-|^first-payout-|^liquid-zar-payout-/i.test(
        doc.id
      )
    if (!shouldDelete) continue
    // Keep the Day-1 fund intro card.
    if (action === 'fund_intro' || doc.id.startsWith('welcome-fund-mzn')) continue
    await doc.ref.delete()
    deleted += 1
    console.log('deleted event', doc.id, title.slice(0, 60))
  }
  console.log('done', { uid, deleted })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

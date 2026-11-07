/**
 * Replace the Day-1 welcome card with Fund your MZN account (welcome-fund-mzn-v1).
 *
 *   cd functions && npx tsx scripts/reseedWelcomeFundMzn.ts [uid]
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

const WELCOME_EVENT_ID = 'welcome-fund-mzn-v1'
const LEGACY_IDS = ['welcome-paga-intro-v2', 'welcome-paga-intro-v1', 'welcome-paga-intro']
const ACCOUNT = '4841111710001'
const RECIPIENT = 'WOLF DIGITAL, LDA.'
const BANK = 'Moza Banco'

const uid = process.argv[2] || 'l4Ia5CPAxlTg39C9RhiA03qozlY2'

function paymentReference(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const seq = String((Date.now() % 900) + 100)
  return `WOLFMOZA${y}${m}${d}${seq}`
}

async function main() {
  const events = db.collection('users').doc(uid).collection('activityEvents')
  for (const id of LEGACY_IDS) {
    const snap = await events.doc(id).get()
    if (snap.exists) {
      await events.doc(id).delete()
      console.log('deleted', id)
    }
  }

  const ref = paymentReference()
  const deskSentence =
    'Send meticais to the account below. We start converting the moment it lands, and your liquid ZAR is ready to withdraw from 09:00 every day.'
  const deskLedgerRows = [
    { label: 'Recipient', value: RECIPIENT, valueStrong: true },
    { label: 'Bank', value: BANK },
    { label: 'Account', value: ACCOUNT, valueStrong: true, copyable: true },
    { label: 'Reference', value: ref, valueStrong: true, copyable: true },
  ]
  const deskSteps = [
    'Transfer MZN to this account',
    'We convert it to liquid ZAR',
    'Withdraw from 09:00 daily',
  ]
  const deskNote =
    'Most funds are liquid by 09:00 the next day. Some routes take up to 2 banking days. The Liquidity report shows where every metical is.'
  const deskNoteAlt =
    'A maior parte fica líquida até às 09:00 do dia seguinte; algumas rotas levam até 2 dias úteis.'

  await events.doc(WELCOME_EVENT_ID).set({
    id: WELCOME_EVENT_ID,
    kind: 'CONVERSION_ROUTING_INSTRUCTION',
    title: 'Fund your MZN account',
    body: deskSentence,
    dropdownTitle: 'Fund your MZN account',
    dropdownBody: 'Send MZN to Moza Banco. Liquid ZAR from 09:00 daily.',
    deskSentence,
    deskLedgerRows,
    deskSteps,
    deskNote,
    deskNoteAlt,
    fundAccountNumber: ACCOUNT,
    paymentReference: ref,
    actorType: 'ai_manager',
    deskSpeaker: 'sam',
    routingAction: 'fund_intro',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    recordingSource: 'ADMIN_SCRIPT',
  })

  await db.collection('users').doc(uid).set(
    { welcomePagaIntroAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  )

  console.log(JSON.stringify({ uid, eventId: WELCOME_EVENT_ID, paymentReference: ref }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

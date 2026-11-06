/**
 * Re-parse unparsed Capitec "Your settlement summary" evidence with account passwords.
 *
 *   cd functions && npx ts-node --transpile-only scripts/reprocessCapitecSettlements.ts
 */
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as admin from 'firebase-admin'
import { pdfText } from '../src/inbound/fnbPdf'
import { capitecPdfPasswordList } from '../src/inbound/capitecPdfPasswords'
import { parseCapitecSettlement, capitecSettlementCopy } from '../src/inbound/capitecSettlement'
import { applyCapitecPayoutToInvoices } from '../src/settlement/issueInvoices'
import { CONVERSION_ROUTING_KIND, ROUTING_ADMIN_UID } from '../src/routing/conversionRouter'

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

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'gobankless-dev',
    storageBucket: 'gobankless-dev.firebasestorage.app',
  })
}
const db = admin.firestore()
const passwords = capitecPdfPasswordList(process.env.CAPITEC_PDF_PASSWORD || '')

async function main() {
  const recent = await db.collection('bankEvidence').orderBy('createdAt', 'desc').limit(200).get()
  const targets = recent.docs.filter((doc) => {
    const x = doc.data()
    return (
      /settlement summary/i.test(String(x.subject || '')) &&
      /capitecbank\.co\.za/i.test(String(x.from || '')) &&
      x.parseStatus !== 'parsed' &&
      Array.isArray(x.attachments) &&
      x.attachments.length > 0
    )
  })
  console.log(
    JSON.stringify(
      { passwordCount: passwords.length, targets: targets.map((d) => d.id) },
      null,
      2
    )
  )

  let recorded = 0
  let failed = 0
  for (const doc of targets) {
    const evidence = doc.data()
    const pdf = (evidence.attachments || []).find(
      (row: { contentType?: string; safeFilename?: string }) =>
        /pdf/i.test(String(row.contentType || '')) || /\.pdf$/i.test(String(row.safeFilename || ''))
    )
    if (!pdf) {
      failed += 1
      continue
    }
    try {
      const [bytes] = await admin.storage().bucket().file(pdf.storagePath).download()
      const text = await pdfText(bytes, passwords)
      const settlement = parseCapitecSettlement(text)
      if (!settlement) {
        console.log('parse_miss', doc.id)
        failed += 1
        continue
      }
      const eventId = (settlement.reference || `pdf-${pdf.sha256.slice(0, 32)}`).replace(
        /[^\w.-]+/g,
        '-'
      )
      const eventRef = db.collection('bankCapitecEvents').doc(eventId)
      const existing = await eventRef.get()
      if (!existing.exists) {
        await eventRef.set({
          ...settlement,
          resendEmailId: doc.id,
          from: evidence.from,
          subject: evidence.subject,
          createdAt: new Date().toISOString(),
        })
      }
      await doc.ref.set(
        { parseStatus: 'parsed', capitecKind: settlement.kind },
        { merge: true }
      )

      const noticeId = `capitec-${eventId}`
      const noticeRef = db
        .collection('users')
        .doc(ROUTING_ADMIN_UID)
        .collection('activityEvents')
        .doc(noticeId)
      if (!(await noticeRef.get()).exists) {
        const copy = capitecSettlementCopy(settlement)
        await noticeRef.set({
          id: noticeId,
          kind: CONVERSION_ROUTING_KIND,
          title: copy.title,
          body: copy.body,
          dropdownTitle: copy.title,
          dropdownBody: copy.body,
          actorType: 'ai_manager',
          avatarKind: 'convert_zar',
          amountCurrency: 'ZAR',
          amountValue: settlement.paidOutZar,
          amountSign: 'credit',
          txId: noticeId,
          hasDownloadButton: false,
          awaitingConfirm: false,
          routingBlocked: false,
          status: 'recorded',
          routingAction: 'bank_notice',
          deskSpeaker: 'sam',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          recordingSource: 'SYSTEM',
        })
      }

      let marked = 0
      try {
        marked = await applyCapitecPayoutToInvoices(settlement, eventId)
      } catch (error) {
        console.log('invoice_apply_failed', doc.id, error instanceof Error ? error.message : error)
      }
      recorded += 1
      console.log('recorded', {
        emailId: doc.id,
        eventId,
        merchant: settlement.merchant,
        paidOutZar: settlement.paidOutZar,
        marked,
      })
    } catch (error) {
      failed += 1
      console.log('failed', doc.id, error instanceof Error ? error.message : error)
    }
  }
  console.log(JSON.stringify({ recorded, failed }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

import * as admin from 'firebase-admin'
import { CONVERSION_ROUTING_KIND, ROUTING_ADMIN_UID } from '../routing/conversionRouter'
import {
  attachInvoicePdf,
  markInvoiceZarAvailable,
  raiseCustomerInvoice,
  raiseUpstreamInvoice,
  type SettlementInvoice,
} from './invoice'
import { renderSettlementInvoicePdf, settlementInvoiceFilename } from './invoicePdf'
import { railByMerchantId, resolveMerchantDescriptor } from './register'
import { zipBuffers } from './zipBuffers'
import type { FnbSettlement } from './fnbSettlement'
import type { CapitecSettlement } from '../inbound/capitecSettlement'

const db = () => admin.firestore()

function bucket() {
  return admin.storage().bucket()
}

export async function storeInvoicePdf(invoice: SettlementInvoice): Promise<SettlementInvoice> {
  const bytes = await renderSettlementInvoicePdf(invoice)
  const filename = settlementInvoiceFilename(invoice)
  const storagePath = `settlement-invoices/${invoice.issuerId}/${filename}`
  const file = bucket().file(storagePath)
  await file.save(bytes, {
    contentType: 'application/pdf',
    metadata: { cacheControl: 'private, max-age=0' },
  })
  let pdfUrl: string | null = null
  try {
    const [url] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 7 * 24 * 60 * 60 * 1000 })
    pdfUrl = url
  } catch {
    pdfUrl = null
  }
  await attachInvoicePdf(invoice.id, storagePath, pdfUrl)
  return { ...invoice, storagePath, pdfUrl }
}

export async function raiseAndStoreCustomerInvoice(
  input: Parameters<typeof raiseCustomerInvoice>[0]
): Promise<SettlementInvoice> {
  const invoice = await raiseCustomerInvoice(input)
  return storeInvoicePdf(invoice)
}

async function buildInvoiceZip(invoices: SettlementInvoice[]): Promise<{
  storagePath: string
  filename: string
  totalZar: number
}> {
  const files: Array<{ name: string; data: Buffer }> = []
  let totalZar = 0
  for (const invoice of invoices) {
    if (!invoice.storagePath) continue
    const [bytes] = await bucket().file(invoice.storagePath).download()
    files.push({ name: settlementInvoiceFilename(invoice), data: bytes })
    totalZar += invoice.totalZar
  }
  const cycle = invoices.find((row) => typeof row.cycleNumber === 'number')?.cycleNumber
  const run = invoices.find((row) => row.testRunId)?.testRunId || 'pack'
  const filename =
    typeof cycle === 'number'
      ? `cycle-${cycle}-invoices.zip`
      : `invoices-${new Date().toISOString().slice(0, 10)}.zip`
  const storagePath = `settlement-invoices/packs/${run}/${filename}`
  const content = zipBuffers(files)
  await bucket().file(storagePath).save(content, {
    contentType: 'application/zip',
    metadata: { cacheControl: 'private, max-age=0' },
  })
  return { storagePath, filename, totalZar: Math.round(totalZar * 100) / 100 }
}

/** One Sam desk card + one zip for a batch of invoices (not one message per PDF). */
export async function publishInvoicePackDeskNotice(params: {
  invoices: SettlementInvoice[]
  testRunId?: string
  cycleNumber?: number
}): Promise<void> {
  const invoices = params.invoices.filter((row) => row.storagePath)
  if (!invoices.length) return
  const packKey =
    params.testRunId && typeof params.cycleNumber === 'number'
      ? `${params.testRunId}-c${params.cycleNumber}`
      : invoices
          .map((row) => row.id)
          .sort()
          .join('-')
          .slice(0, 80)
  const id = `invoice-pack-${packKey}`
  const ref = db().collection('users').doc(ROUTING_ADMIN_UID).collection('activityEvents').doc(id)
  if ((await ref.get()).exists) return

  const zip = await buildInvoiceZip(invoices)
  const names = [...new Set(invoices.map((row) => row.invoiceNumber))]
  const body =
    invoices.length === 1
      ? `${invoices[0]!.issuerLegalName} billed R${zip.totalZar.toFixed(2)}. Download the invoice zip from the desk card.`
      : `${invoices.length} invoices raised for R${zip.totalZar.toFixed(2)} (${names.slice(0, 4).join(', ')}${
          names.length > 4 ? '…' : ''
        }). Download the zip from the desk card.`

  await ref.set({
    id,
    kind: CONVERSION_ROUTING_KIND,
    title:
      typeof params.cycleNumber === 'number'
        ? `Invoices · Cycle ${params.cycleNumber}`
        : `Invoices · ${invoices.length} PDFs`,
    body,
    dropdownTitle: zip.filename,
    dropdownBody: `${invoices.length} invoice${invoices.length === 1 ? '' : 's'} · R${zip.totalZar.toFixed(2)}`,
    actorType: 'ai_manager',
    avatarKind: 'convert_zar',
    amountCurrency: 'ZAR',
    amountValue: zip.totalZar,
    amountSign: 'debit',
    txId: id,
    hasDownloadButton: true,
    showCalendarButton: true,
    invoicePackId: id,
    invoiceIds: invoices.map((row) => row.id),
    invoiceZipStoragePath: zip.storagePath,
    invoiceZipFilename: zip.filename,
    awaitingConfirm: false,
    routingBlocked: false,
    status: 'recorded',
    routingAction: 'invoice',
    deskSpeaker: 'sam',
    ...(params.testRunId ? { testRunId: params.testRunId } : {}),
    ...(typeof params.cycleNumber === 'number' ? { cycleNumber: params.cycleNumber } : {}),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    recordingSource: 'SYSTEM',
  })
}

/** Single-invoice backfills still go through the pack publisher (one zip, one Sam card). */
export async function publishInvoiceDeskNotice(invoice: SettlementInvoice): Promise<void> {
  await publishInvoicePackDeskNotice({
    invoices: [invoice],
    testRunId: invoice.testRunId || undefined,
    cycleNumber: typeof invoice.cycleNumber === 'number' ? invoice.cycleNumber : undefined,
  })
}

export async function raiseInvoicesForCycle(input: {
  testRunId: string
  cycleNumber: number
  assignments: Array<{
    cardId: number
    machineId: number
    amount: number
    economicPaymentId?: string
  }>
}): Promise<SettlementInvoice[]> {
  const raised: SettlementInvoice[] = []
  for (const row of input.assignments) {
    const invoice = await raiseAndStoreCustomerInvoice({
      machineId: row.machineId,
      deskCardId: row.cardId,
      amountZar: row.amount,
      raisedTiming: 'at_issue',
      testRunId: input.testRunId,
      cycleNumber: input.cycleNumber,
      economicPaymentId: row.economicPaymentId || null,
    })
    raised.push(invoice)
    if (invoice.issuerId === 'imani') {
      const upstream = await raiseUpstreamInvoice({
        supplierId: 'house_of_exports',
        merchantId: 'imani',
        amountZar: row.amount,
        customerInvoiceId: invoice.id,
        notes: ['HOE supply for Imani wholesale resale.'],
      })
      const storedUpstream = await storeInvoicePdf(upstream)
      raised.push(storedUpstream)
    }
  }
  await publishInvoicePackDeskNotice({
    invoices: raised,
    testRunId: input.testRunId,
    cycleNumber: input.cycleNumber,
  })
  return raised
}

async function openInvoicesForMerchant(merchantId: string | null, descriptor: string | null) {
  const rail = merchantId ? railByMerchantId(merchantId) : null
  const company = rail ? rail.companyId : resolveMerchantDescriptor(descriptor)?.id
  if (!company) return []
  const snap = await db()
    .collection('settlementInvoices')
    .where('issuerId', '==', company)
    .where('funding.zarAvailable', '==', false)
    .limit(50)
    .get()
  return snap.docs.map((doc) => ({ ...(doc.data() as SettlementInvoice), id: doc.id }))
}

export async function applyCapitecPayoutToInvoices(
  settlement: CapitecSettlement,
  settlementDocId: string
): Promise<number> {
  const open = await openInvoicesForMerchant(settlement.merchantId, settlement.merchant)
  if (!open.length) return 0
  const exact = open.filter((invoice) => Math.abs(invoice.totalZar - settlement.salesZar) < 0.02)
  const targets = exact.length ? exact : open.sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate))
  let marked = 0
  let remainingNet = settlement.paidOutZar
  let remainingSales = settlement.salesZar
  for (const invoice of targets) {
    if (!(remainingSales > 0) || !(remainingNet > 0)) break
    if (remainingSales + 0.005 < invoice.totalZar && exact.length === 0) continue
    const share =
      remainingSales > 0 ? Math.min(invoice.totalZar, remainingSales) / Math.max(remainingSales, invoice.totalZar) : 1
    const credit =
      exact.length === 1 && targets.length === 1
        ? settlement.paidOutZar
        : Math.round(settlement.paidOutZar * (invoice.totalZar / Math.max(settlement.salesZar, invoice.totalZar)) * 100) /
          100
    await markInvoiceZarAvailable({
      invoiceId: invoice.id,
      amountZar: Math.min(credit, remainingNet),
      source: 'capitec_net_payout',
      settlementDocId,
      at: settlement.payoutOn || undefined,
    })
    remainingNet = Math.round((remainingNet - Math.min(credit, remainingNet)) * 100) / 100
    remainingSales = Math.round((remainingSales - invoice.totalZar) * 100) / 100
    marked += 1
    void share
  }
  return marked
}

export async function applyFnbGrossSettlementToInvoices(
  settlement: FnbSettlement,
  settlementDocId: string
): Promise<number> {
  const open = await openInvoicesForMerchant(settlement.merchantNumber, settlement.merchantName)
  let marked = 0
  const byLast4 = new Map<string, number>()
  for (const txn of settlement.transactions) {
    const last4 = txn.cardMasked?.slice(-4)
    if (!last4) continue
    byLast4.set(last4, Math.round(((byLast4.get(last4) || 0) + txn.amountZar) * 100) / 100)
  }
  for (const invoice of open) {
    const last4 = invoice.paymentTrace.cardMasked?.slice(-4)
    const matchedAmount = last4 ? byLast4.get(last4) : null
    const hit =
      matchedAmount != null && Math.abs(matchedAmount - invoice.totalZar) < 0.02
        ? invoice.totalZar
        : settlement.transactions.some((txn) => Math.abs(txn.amountZar - invoice.totalZar) < 0.02)
          ? invoice.totalZar
          : null
    if (hit == null) continue
    await markInvoiceZarAvailable({
      invoiceId: invoice.id,
      amountZar: hit,
      source: 'fnb_gross_settlement',
      settlementDocId,
      at: settlement.statementDate || undefined,
    })
    marked += 1
  }
  return marked
}

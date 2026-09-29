import * as admin from 'firebase-admin'
import {
  BUYER_CARDS,
  COMPANIES,
  LEMON_SCHEDULE_A_LINES,
  buyerByDeskCardId,
  companyOf,
  railByMachineId,
  type CompanyRecord,
  type RailRecord,
} from './register'

const db = () => admin.firestore()

export const INVOICE_COLLECTION = 'settlementInvoices'

export type InvoiceLine = {
  sku: string
  description: string
  qty: number
  unitPriceZar: number
  lineTotalZar: number
}

export type InvoiceFunding = {
  zarAvailable: boolean
  zarAvailableZar: number | null
  zarAvailableAt: string | null
  zarAvailableSource: 'fnb_gross_settlement' | 'capitec_net_payout' | null
  reversalExposure: boolean
  settlementDocId: string | null
}

export type InvoicePaymentTrace = {
  method: string | null
  cardMasked: string | null
  authCode: string | null
  rrn: string | null
  uti: string | null
  receiptDocId: string | null
}

export type SettlementInvoice = {
  id: string
  invoiceNumber: string
  kind: 'customer' | 'upstream'
  raisedTiming: 'at_issue' | 'raised_after_swipe'
  status: 'issued' | 'paid_in_full' | 'awaiting_payout' | 'funded'
  currency: 'ZAR'
  paymentTerms: 'Prepaid'
  vatChargedZar: number
  subtotalZar: number
  totalZar: number
  invoiceDate: string
  transactionTime: string | null
  issuerId: string
  issuerLegalName: string
  issuerFormerLegalName: string | null
  issuerTradingAs: string | null
  issuerRegistration: string | null
  issuerTaxNumber: string | null
  issuerAddressLines: string[]
  billToId: string
  billToLegalName: string
  billToTradingAs: string | null
  billToNuit: string | null
  billToRegistration: string | null
  billToAddressLines: string[]
  customerNo: string | null
  orderNo: string | null
  lines: InvoiceLine[]
  railId: string | null
  machineId: number | null
  deskCardId: number | null
  relatedParty: boolean
  funding: InvoiceFunding
  paymentTrace: InvoicePaymentTrace
  testRunId: string | null
  cycleNumber: number | null
  economicPaymentId: string | null
  storagePath: string | null
  pdfUrl: string | null
  notes: string[]
  createdAt: string
  updatedAt: string
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

function isoDate(d = new Date()): string {
  return d.toISOString().slice(0, 10)
}

function billToLabel(company: CompanyRecord): string {
  if (company.tradingAs) return `${company.legalName} (trading as ${company.tradingAs})`
  return company.legalName
}

function customerNoFor(buyerId: string): string {
  const map: Record<string, string> = {
    multivendas: 'CUS-001',
    vidrotec: 'CUS-002',
    brics_ai_ei: 'CUS-003',
    wolf_digital: 'CUS-004',
    goblin: 'CUS-005',
  }
  return map[buyerId] || `CUS-${buyerId}`
}

function lemonLinesForAmount(amountZar: number): InvoiceLine[] {
  const primary = LEMON_SCHEDULE_A_LINES[0]!
  return [
    {
      sku: primary.sku,
      description: primary.description,
      qty: 1,
      unitPriceZar: roundMoney(amountZar),
      lineTotalZar: roundMoney(amountZar),
    },
  ]
}

function imaniLinesForAmount(amountZar: number): InvoiceLine[] {
  return [
    {
      sku: 'HAIR-WS',
      description: 'Wholesale hair and beauty supplies — as ordered',
      qty: 1,
      unitPriceZar: roundMoney(amountZar),
      lineTotalZar: roundMoney(amountZar),
    },
  ]
}

function wolfSonsLinesForAmount(amountZar: number): InvoiceLine[] {
  return [
    {
      sku: 'MGMT-CONS',
      description:
        'Management consultancy, econometric and related professional services to business clients across Southern Africa',
      qty: 1,
      unitPriceZar: roundMoney(amountZar),
      lineTotalZar: roundMoney(amountZar),
    },
  ]
}

function linesForIssuer(issuerId: string, amountZar: number): InvoiceLine[] {
  if (issuerId === 'lemon_economics') return lemonLinesForAmount(amountZar)
  if (issuerId === 'imani') return imaniLinesForAmount(amountZar)
  if (issuerId === 'wolf_and_sons') return wolfSonsLinesForAmount(amountZar)
  if (issuerId === 'house_of_exports') return imaniLinesForAmount(amountZar)
  return [{ sku: 'SVC', description: 'Professional services', qty: 1, unitPriceZar: amountZar, lineTotalZar: amountZar }]
}

async function nextInvoiceNumber(issuer: CompanyRecord, year: number): Promise<string> {
  const prefix = issuer.invoicePrefix || 'INV'
  const counterRef = db().collection('settlementCounters').doc(`${prefix}-${year}`)
  const number = await db().runTransaction(async (tx) => {
    const snap = await tx.get(counterRef)
    const current = snap.exists ? Number(snap.data()?.next || 1) : 1
    const next = current + 1
    tx.set(counterRef, { next, prefix, year, updatedAt: new Date().toISOString() }, { merge: true })
    return current
  })
  return `${prefix}-${year}-${String(number).padStart(4, '0')}`
}

export async function raiseCustomerInvoice(input: {
  machineId: number
  deskCardId: number
  amountZar: number
  raisedTiming?: 'at_issue' | 'raised_after_swipe'
  invoiceDate?: string
  transactionTime?: string | null
  testRunId?: string | null
  cycleNumber?: number | null
  economicPaymentId?: string | null
  paymentTrace?: Partial<InvoicePaymentTrace>
  notes?: string[]
}): Promise<SettlementInvoice> {
  const rail = railByMachineId(input.machineId)
  if (!rail) throw new Error(`no rail for machine ${input.machineId}`)
  const issuer = companyOf(rail.companyId)
  const buyerCard = buyerByDeskCardId(input.deskCardId)
  if (!buyerCard) throw new Error(`no buyer for card ${input.deskCardId}`)
  const buyer = companyOf(buyerCard.companyId)
  const amount = roundMoney(input.amountZar)
  if (!(amount > 0)) throw new Error('invoice amount must be positive')
  const year = Number((input.invoiceDate || isoDate()).slice(0, 4))
  const invoiceNumber = await nextInvoiceNumber(issuer, year)
  const lines = linesForIssuer(issuer.id, amount)
  const now = new Date().toISOString()
  const relatedParty = Boolean(issuer.relatedPartyNote || buyer.relatedPartyNote)
  const invoice: SettlementInvoice = {
    id: invoiceNumber.replace(/[^\w.-]+/g, '-'),
    invoiceNumber,
    kind: 'customer',
    raisedTiming: input.raisedTiming || 'at_issue',
    status: input.raisedTiming === 'raised_after_swipe' ? 'paid_in_full' : 'issued',
    currency: 'ZAR',
    paymentTerms: 'Prepaid',
    vatChargedZar: 0,
    subtotalZar: amount,
    totalZar: amount,
    invoiceDate: input.invoiceDate || isoDate(),
    transactionTime: input.transactionTime || null,
    issuerId: issuer.id,
    issuerLegalName: issuer.legalName,
    issuerFormerLegalName: issuer.formerLegalName || null,
    issuerTradingAs: issuer.tradingAs || null,
    issuerRegistration: issuer.registrationNumber,
    issuerTaxNumber: issuer.taxNumber,
    issuerAddressLines: issuer.addressLines,
    billToId: buyer.id,
    billToLegalName: buyer.legalName,
    billToTradingAs: buyer.tradingAs || null,
    billToNuit: buyer.nuit,
    billToRegistration: buyer.registrationNumber,
    billToAddressLines: buyer.addressLines,
    customerNo: `${issuer.invoicePrefix}-${customerNoFor(buyer.id)}`,
    orderNo: null,
    lines,
    railId: rail.id,
    machineId: rail.machineId,
    deskCardId: input.deskCardId,
    relatedParty,
    funding: {
      zarAvailable: false,
      zarAvailableZar: null,
      zarAvailableAt: null,
      zarAvailableSource: null,
      reversalExposure: true,
      settlementDocId: null,
    },
    paymentTrace: {
      method: input.paymentTrace?.method || null,
      cardMasked: input.paymentTrace?.cardMasked || buyerCard.masked,
      authCode: input.paymentTrace?.authCode || null,
      rrn: input.paymentTrace?.rrn || null,
      uti: input.paymentTrace?.uti || null,
      receiptDocId: input.paymentTrace?.receiptDocId || null,
    },
    testRunId: input.testRunId || null,
    cycleNumber: input.cycleNumber ?? null,
    economicPaymentId: input.economicPaymentId || null,
    storagePath: null,
    pdfUrl: null,
    notes: [
      ...(input.notes || []),
      relatedParty ? 'Related-party sale — price must be arm’s length.' : '',
      issuer.formerLegalName
        ? `Issuer continuity: ${issuer.legalName} (formerly ${issuer.formerLegalName}).`
        : '',
      buyer.tradingAs ? `Buyer trading as ${buyer.tradingAs}.` : '',
      'VAT charged R0.00 — not a VAT tax invoice where the issuer is not VAT-registered.',
    ].filter(Boolean),
    createdAt: now,
    updatedAt: now,
  }
  await db().collection(INVOICE_COLLECTION).doc(invoice.id).set(invoice)
  return invoice
}

export async function raiseUpstreamInvoice(input: {
  supplierId: string
  merchantId: string
  amountZar: number
  customerInvoiceId?: string | null
  invoiceDate?: string
  notes?: string[]
}): Promise<SettlementInvoice> {
  const supplier = companyOf(input.supplierId)
  const merchant = companyOf(input.merchantId)
  if (supplier.kind !== 'upstream_supplier') throw new Error('supplier must be upstream')
  const amount = roundMoney(input.amountZar)
  const year = Number((input.invoiceDate || isoDate()).slice(0, 4))
  const invoiceNumber = await nextInvoiceNumber(supplier, year)
  const now = new Date().toISOString()
  const invoice: SettlementInvoice = {
    id: invoiceNumber.replace(/[^\w.-]+/g, '-'),
    invoiceNumber,
    kind: 'upstream',
    raisedTiming: 'at_issue',
    status: 'issued',
    currency: 'ZAR',
    paymentTerms: 'Prepaid',
    vatChargedZar: 0,
    subtotalZar: amount,
    totalZar: amount,
    invoiceDate: input.invoiceDate || isoDate(),
    transactionTime: null,
    issuerId: supplier.id,
    issuerLegalName: supplier.legalName,
    issuerFormerLegalName: null,
    issuerTradingAs: null,
    issuerRegistration: supplier.registrationNumber,
    issuerTaxNumber: supplier.taxNumber,
    issuerAddressLines: supplier.addressLines,
    billToId: merchant.id,
    billToLegalName: merchant.legalName,
    billToTradingAs: merchant.tradingAs || null,
    billToNuit: merchant.nuit,
    billToRegistration: merchant.registrationNumber,
    billToAddressLines: merchant.addressLines,
    customerNo: null,
    orderNo: input.customerInvoiceId || null,
    lines: linesForIssuer(supplier.id, amount),
    railId: null,
    machineId: null,
    deskCardId: null,
    relatedParty: true,
    funding: {
      zarAvailable: false,
      zarAvailableZar: null,
      zarAvailableAt: null,
      zarAvailableSource: null,
      reversalExposure: false,
      settlementDocId: null,
    },
    paymentTrace: {
      method: null,
      cardMasked: null,
      authCode: null,
      rrn: null,
      uti: null,
      receiptDocId: null,
    },
    testRunId: null,
    cycleNumber: null,
    economicPaymentId: null,
    storagePath: null,
    pdfUrl: null,
    notes: [
      ...(input.notes || []),
      'Upstream supplier invoice. Release only after the matching customer invoice has zar_available.',
    ],
    createdAt: now,
    updatedAt: now,
  }
  await db().collection(INVOICE_COLLECTION).doc(invoice.id).set(invoice)
  return invoice
}

export async function markInvoiceZarAvailable(input: {
  invoiceId: string
  amountZar: number
  source: 'fnb_gross_settlement' | 'capitec_net_payout'
  settlementDocId: string
  at?: string
}): Promise<void> {
  const ref = db().collection(INVOICE_COLLECTION).doc(input.invoiceId)
  await ref.set(
    {
      status: 'funded',
      funding: {
        zarAvailable: true,
        zarAvailableZar: roundMoney(input.amountZar),
        zarAvailableAt: input.at || new Date().toISOString(),
        zarAvailableSource: input.source,
        reversalExposure: true,
        settlementDocId: input.settlementDocId,
      },
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  )
}

export async function attachInvoicePdf(
  invoiceId: string,
  storagePath: string,
  pdfUrl: string | null
): Promise<void> {
  await db().collection(INVOICE_COLLECTION).doc(invoiceId).set(
    {
      storagePath,
      pdfUrl,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  )
}

export function issuerCompany(invoice: SettlementInvoice): CompanyRecord {
  return companyOf(invoice.issuerId)
}

export function billToDisplayName(invoice: SettlementInvoice): string {
  const company = COMPANIES[invoice.billToId]
  if (!company) return invoice.billToLegalName
  return billToLabel(company)
}

export function railOfInvoice(invoice: SettlementInvoice): RailRecord | null {
  if (invoice.machineId == null) return null
  return railByMachineId(invoice.machineId)
}

export { BUYER_CARDS }

/**
 * Background EFT instruct email when MZN residual is queued.
 * Client never sees this. Amounts ledger-fixed. Invoice PDF matches PoP/deposit style:
 * logo top-left, title, hairline, bold labels + values.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'
import PDFDocument from 'pdfkit'
import { sendEmailViaResend } from '../utils/resendEmail'
import { formatPtDate, formatPtZar } from '../routing/bankEmailRound'
import {
  invoicePrefixForRoute,
  selectEftRoute,
  shortInvoiceNumber,
  type EftRoute,
} from './eftRouteCatalog'

const db = () => admin.firestore()
const TEST_ALLOWLIST = ['ygor@brics.ninja'] as const
const OUTBOUND_COLLECTION = 'opsBankEftEmails'

function roundMajor(n: number): number {
  return Math.round(n * 100) / 100
}

function normalizeEmail(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function formatZarEn(amount: number): string {
  return `R ${amount.toLocaleString('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatMznEn(amount: number): string {
  return `${amount.toLocaleString('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} MZN`
}

function assetPath(filename: string): string | null {
  const candidates = [
    path.join(__dirname, '../../assets', filename),
    path.join(process.cwd(), 'assets', filename),
    path.join(process.cwd(), 'functions/assets', filename),
  ]
  return candidates.find((candidate) => fs.existsSync(candidate)) || null
}

function companyLabel(legalName: string, tradingAs?: string | null): string {
  return tradingAs ? `${legalName} trading as ${tradingAs}` : legalName
}

export function residualEftOutboundAllowlist(): string[] {
  let configured: string[] = []
  try {
    configured = String(functions.config().email?.eft_test_to || '')
      .split(',')
      .map(normalizeEmail)
      .filter(Boolean)
  } catch {
    configured = []
  }
  return [...new Set<string>([...TEST_ALLOWLIST, ...configured])]
}

function buildBodyEn(params: {
  route: EftRoute
  amountZar: number
  residualMzn: number
  sellRate: number
  invoiceNumber: string
  creditByMs: number
}): string {
  const { route } = params
  const pay = route.payerAccount
  const ben = route.beneficiaryBank
  const dear =
    route.banker.salutation === 'Exma. Sra.' ? `Dear Ms ${route.banker.banker}` : `Dear Mr ${route.banker.banker}`
  return [
    `${dear},`,
    '',
    `Please find attached invoice ${params.invoiceNumber} issued by ${companyLabel(route.beneficiaryCompany.legalName, route.beneficiaryCompany.tradingAs)} (South Africa).`,
    '',
    'Kindly arrange the EFT below for today’s residual settlement corridor:',
    '',
    `Invoice total: ${formatZarEn(params.amountZar)}`,
    `Residual covered: ${formatMznEn(params.residualMzn)} at ${params.sellRate.toFixed(4)} MZN/ZAR`,
    `Credit required by: ${formatPtDate(params.creditByMs)}`,
    `Route: ${route.label}`,
    '',
    'Remitting party (Mozambique)',
    `Entity: ${companyLabel(route.payer.legalName, route.payer.tradingAs)}`,
    route.payer.nuit ? `NUIT: ${route.payer.nuit}` : null,
    `Bank: ${pay.bankName}`,
    `Account name: ${pay.accountName}`,
    `Account number: ${pay.accountNumber}`,
    pay.nib ? `NIB: ${pay.nib}` : null,
    pay.iban ? `IBAN: ${pay.iban}` : null,
    pay.swift ? `SWIFT: ${pay.swift}` : null,
    '',
    'Beneficiary (South Africa)',
    `Entity: ${companyLabel(route.beneficiaryCompany.legalName, route.beneficiaryCompany.tradingAs)}`,
    route.beneficiaryCompany.registrationNumber
      ? `Registration: ${route.beneficiaryCompany.registrationNumber}`
      : null,
    `Bank: ${ben.bankName}`,
    `Account name: ${ben.accountName}`,
    `Account number: ${ben.accountNumber}`,
    ben.branchCode ? `Branch code: ${ben.branchCode}` : null,
    ben.swift ? `SWIFT: ${ben.swift}` : null,
    ben.accountType ? `Account type: ${ben.accountType}` : null,
    `Payment reference: ${params.invoiceNumber}`,
    '',
    'Please confirm if this amount can be processed on these terms, and advise once instructed.',
    '',
    'Kind regards,',
    'Settlement Desk',
    'Econometrica (Pty) Ltd trading as Paga',
    'FSP 52815 · desk@mozpaga.xyz',
  ]
    .filter((line) => line !== null)
    .join('\n')
}

function buildBodyPt(params: {
  route: EftRoute
  amountZar: number
  residualMzn: number
  sellRate: number
  invoiceNumber: string
  creditByMs: number
}): string {
  const { route } = params
  const pay = route.payerAccount
  const ben = route.beneficiaryBank
  return [
    `${route.banker.salutation} ${route.banker.banker},`,
    '',
    `Junto enviamos a factura ${params.invoiceNumber} emitida por ${companyLabel(route.beneficiaryCompany.legalName, route.beneficiaryCompany.tradingAs)} (África do Sul).`,
    '',
    'Solicitamos a organização da seguinte EFT no corredor de liquidação residual de hoje:',
    '',
    `Total da factura: ${formatPtZar(params.amountZar)}`,
    `Residual coberto: ${params.residualMzn.toFixed(2)} MZN à taxa ${params.sellRate.toFixed(4)} MZN/ZAR`,
    `Crédito previsto até: ${formatPtDate(params.creditByMs)}`,
    `Rota: ${route.label}`,
    '',
    'Parte remetente (Moçambique)',
    `Entidade: ${companyLabel(route.payer.legalName, route.payer.tradingAs)}`,
    route.payer.nuit ? `NUIT: ${route.payer.nuit}` : null,
    `Banco: ${pay.bankName}`,
    `Nome da conta: ${pay.accountName}`,
    `Número da conta: ${pay.accountNumber}`,
    pay.nib ? `NIB: ${pay.nib}` : null,
    pay.iban ? `IBAN: ${pay.iban}` : null,
    pay.swift ? `SWIFT: ${pay.swift}` : null,
    '',
    'Beneficiário (África do Sul)',
    `Entidade: ${companyLabel(route.beneficiaryCompany.legalName, route.beneficiaryCompany.tradingAs)}`,
    route.beneficiaryCompany.registrationNumber
      ? `Registo: ${route.beneficiaryCompany.registrationNumber}`
      : null,
    `Banco: ${ben.bankName}`,
    `Nome da conta: ${ben.accountName}`,
    `Número da conta: ${ben.accountNumber}`,
    ben.branchCode ? `Código de agência: ${ben.branchCode}` : null,
    ben.swift ? `SWIFT: ${ben.swift}` : null,
    ben.accountType ? `Tipo de conta: ${ben.accountType}` : null,
    `Referência de pagamento: ${params.invoiceNumber}`,
    '',
    'Agradecemos confirmação se o montante pode ser processado nestas condições, e aviso após a instrução.',
    '',
    'Com os melhores cumprimentos,',
    'Secretariado de Liquidação',
    'Econometrica (Pty) Ltd trading as Paga',
    'FSP 52815 · desk@mozpaga.xyz',
  ]
    .filter((line) => line !== null)
    .join('\n')
}

function buildHtml(bodyEn: string, bodyPt: string, testNote: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>')
  return `<!DOCTYPE html>
<html><body style="font-family:Arial,Helvetica,sans-serif;line-height:1.55;color:#222;max-width:640px">
<p style="font-size:12px;color:#666;margin:0 0 12px">English</p>
<div style="margin-bottom:24px">${esc(bodyEn)}</div>
<hr style="border:none;border-top:1px solid #ddd;margin:20px 0" />
<p style="font-size:12px;color:#666;margin:0 0 12px">Português</p>
<div style="margin-bottom:24px">${esc(bodyPt)}</div>
<hr style="border:none;border-top:1px solid #ddd;margin:20px 0" />
<p style="font-size:12px;color:#884400">${esc(testNote)}</p>
</body></html>`
}

/** Simple PoP-style commercial invoice — logo top-left, title, hairline, bold labels. */
async function renderSaCommercialInvoicePdf(params: {
  route: EftRoute
  amountZar: number
  residualMzn: number
  sellRate: number
  invoiceNumber: string
  creditByMs: number
  issuedAtMs: number
}): Promise<Buffer> {
  const { route } = params
  const issuer = route.beneficiaryCompany
  const buyer = route.payer
  const pay = route.payerAccount
  const ben = route.beneficiaryBank

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
    })
    const buffers: Buffer[] = []
    doc.on('data', (c) => buffers.push(c as Buffer))
    doc.on('end', () => resolve(Buffer.concat(buffers)))
    doc.on('error', reject)

    const left = 50
    let y = 48
    const logo = assetPath('MoZ-logo.png')
    if (logo) {
      try {
        doc.image(logo, left, y, { width: 88 })
        y += 58
      } catch {
        // optional
      }
    }

    doc.font('Helvetica-Bold').fontSize(16).fillColor('#111').text('Commercial Invoice', left, y)
    y = doc.y + 6
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#444')
      .text(companyLabel(issuer.legalName, issuer.tradingAs), left, y)
    y = doc.y + 4
    if (issuer.registrationNumber) {
      doc.text(`Reg. ${issuer.registrationNumber} · FSP 52815`, left, y)
      y = doc.y + 10
    }

    doc
      .moveTo(left, y)
      .lineTo(545, y)
      .strokeColor('#111')
      .lineWidth(1)
      .stroke()
    y += 18

    const lineHeight = 22
    const labelWidth = 200
    const addRow = (label: string, value: string, boldValue = false) => {
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#111').text(label, left, y, { width: labelWidth })
      doc
        .font(boldValue ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(11)
        .text(value, left + labelWidth, y, { width: 280 })
      y += lineHeight
    }

    addRow('Invoice number:', params.invoiceNumber, true)
    addRow('Invoice date:', formatPtDate(params.issuedAtMs))
    addRow('Amount due:', formatZarEn(params.amountZar), true)
    addRow('Residual covered:', formatMznEn(params.residualMzn))
    addRow('Rate:', `${params.sellRate.toFixed(4)} MZN/ZAR`)
    addRow('Credit by:', formatPtDate(params.creditByMs))
    addRow('Route:', route.label)

    y += 8
    doc.font('Helvetica-Bold').fontSize(12).text('Bill to', left, y)
    y += lineHeight
    addRow('Entity:', companyLabel(buyer.legalName, buyer.tradingAs))
    if (buyer.nuit) addRow('NUIT:', buyer.nuit)
    addRow('Bank:', pay.bankName)
    addRow('Account name:', pay.accountName)
    addRow('Account number:', pay.accountNumber, true)
    if (pay.nib) addRow('NIB:', pay.nib)
    if (pay.iban) addRow('IBAN:', pay.iban)
    if (pay.swift) addRow('SWIFT:', pay.swift)

    y += 8
    doc.font('Helvetica-Bold').fontSize(12).text('Pay to', left, y)
    y += lineHeight
    addRow('Entity:', companyLabel(issuer.legalName, issuer.tradingAs))
    if (issuer.registrationNumber) addRow('Registration:', issuer.registrationNumber)
    addRow('Bank:', ben.bankName)
    addRow('Account name:', ben.accountName)
    addRow('Account number:', ben.accountNumber, true)
    if (ben.branchCode) addRow('Branch code:', ben.branchCode)
    if (ben.swift) addRow('SWIFT:', ben.swift)
    if (ben.accountType) addRow('Account type:', ben.accountType)
    addRow('Payment reference:', params.invoiceNumber, true)

    y += 16
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#666')
      .text(
        'Amounts are ledger-fixed from the residual queue. Ops / bank instruct document — not shown to the end client.',
        left,
        y,
        { width: 495 }
      )

    doc.end()
  })
}

export type ResidualEftEmailInput = {
  userId: string
  residualMzn: number
  sellRate: number
  queueKey: string
  routeKey?: string | null
}

export async function sendResidualEftBankEmail(input: ResidualEftEmailInput): Promise<void> {
  try {
    await sendResidualEftBankEmailInner(input)
  } catch (error) {
    functions.logger.error('[ResidualEftEmail] send failed', {
      userId: input.userId,
      queueKey: input.queueKey,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

async function sendResidualEftBankEmailInner(input: ResidualEftEmailInput): Promise<void> {
  const residualMzn = roundMajor(input.residualMzn)
  if (!(residualMzn > 0.005)) return
  const sellRate = Number(input.sellRate)
  if (!(sellRate > 0.0001)) {
    functions.logger.warn('[ResidualEftEmail] missing sellRate — skip', {
      userId: input.userId,
      residualMzn,
    })
    return
  }

  const amountZar = roundMajor(residualMzn / sellRate)
  if (!(amountZar > 0.005)) return

  const queueKey = String(input.queueKey || 'na')
    .replace(/[^\w.-]+/g, '-')
    .slice(0, 80)
  const docId = `residual-eft-${input.userId}-${queueKey}-${Math.round(amountZar * 100)}`
    .replace(/[^\w.-]+/g, '-')
    .slice(0, 180)

  const ref = db().collection(OUTBOUND_COLLECTION).doc(docId)
  const existing = await ref.get()
  if (existing.exists && existing.data()?.status === 'sent') {
    functions.logger.info('[ResidualEftEmail] already sent', { docId })
    return
  }

  const allowlist = residualEftOutboundAllowlist()
  const to = allowlist[0]
  if (!to) {
    functions.logger.warn('[ResidualEftEmail] empty allow-list')
    return
  }

  const clockMs = Date.now()
  const route = selectEftRoute(clockMs, input.routeKey)
  const creditByMs = clockMs + 2 * 24 * 60 * 60 * 1000
  const invoiceNumber = shortInvoiceNumber(amountZar, clockMs, invoicePrefixForRoute(route))
  const bodyEn = buildBodyEn({
    route,
    amountZar,
    residualMzn,
    sellRate,
    invoiceNumber,
    creditByMs,
  })
  const bodyPt = buildBodyPt({
    route,
    amountZar,
    residualMzn,
    sellRate,
    invoiceNumber,
    creditByMs,
  })
  const testNote = `[TEST] Intended banker inbox: ${route.banker.email} (${route.banker.shortBank}). Delivered to allow-list ${to}.`
  const subject = `[TEST] EFT instruct · ${invoiceNumber} · ${formatZarEn(amountZar)} · ${route.banker.shortBank}`
  const filename = `${invoiceNumber}.pdf`
  const pdf = await renderSaCommercialInvoicePdf({
    route,
    amountZar,
    residualMzn,
    sellRate,
    invoiceNumber,
    creditByMs,
    issuedAtMs: clockMs,
  })

  await ref.set(
    {
      id: docId,
      kind: 'residual_queue_eft',
      status: 'sending',
      userId: input.userId,
      queueKey,
      residualMzn,
      sellRate,
      amountZar,
      invoiceNumber,
      routeKey: route.key,
      routeLabel: route.label,
      requestedTo: to,
      allowlist,
      intendedBankerEmail: route.banker.email,
      intendedBankKey: route.banker.key,
      payerAccount: route.payerAccount.accountNumber,
      beneficiaryAccount: route.beneficiaryBank.accountNumber,
      subject,
      bodyEn,
      bodyPt,
      filename,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  )

  let deliveredTo = to
  try {
    await sendEmailViaResend(to, subject, buildHtml(bodyEn, bodyPt, testNote), [
      { filename, content: pdf.toString('base64') },
    ])
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const fallback = normalizeEmail(String(functions.config().email?.to || ''))
    const testingOnly =
      /only send testing emails to your own email address/i.test(message) ||
      /verify a domain/i.test(message)
    if (!testingOnly || !fallback || fallback === to) throw error
    deliveredTo = fallback
    await sendEmailViaResend(
      fallback,
      `${subject} · delivered via fallback`,
      buildHtml(bodyEn, bodyPt, `${testNote}\nDelivered to ${fallback}.`),
      [{ filename, content: pdf.toString('base64') }]
    )
  }

  await ref.set(
    {
      status: 'sent',
      to: deliveredTo,
      deliveredTo,
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  )

  functions.logger.info('[ResidualEftEmail] sent', {
    docId,
    invoiceNumber,
    routeKey: route.key,
    requestedTo: to,
    deliveredTo,
    amountZar,
  })
}

export const ops_sendResidualEftBankEmailTest = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required')
    }
    const residualMzn = roundMajor(Number(data?.residualMzn ?? 1000))
    const sellRate = Number(data?.sellRate ?? 4.47)
    const queueKey = String(data?.queueKey || `manual-${Date.now()}`).slice(0, 80)
    const routeKey =
      typeof data?.routeKey === 'string' && data.routeKey.trim() ? data.routeKey.trim() : null
    await sendResidualEftBankEmailInner({
      userId: context.auth.uid,
      residualMzn,
      sellRate,
      queueKey,
      routeKey,
    })
    const route = selectEftRoute(Date.now(), routeKey)
    const amountZar = roundMajor(residualMzn / sellRate)
    return {
      ok: true,
      to: residualEftOutboundAllowlist()[0] || null,
      residualMzn,
      sellRate,
      amountZar,
      queueKey,
      routeKey: route.key,
      invoiceNumber: shortInvoiceNumber(amountZar, Date.now(), invoicePrefixForRoute(route)),
    }
  })

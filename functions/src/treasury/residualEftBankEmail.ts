/**
 * Background EFT instruct email when MZN residual is queued.
 * Client never sees this — ops/test outbound only. Amounts are ledger-fixed (no LLM).
 * Invoice issuer = South African Econometrica (Pty) Ltd t/a Paga.
 * Route selects Moz instructing bank + payer and SA beneficiary account.
 */

import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'
import PDFDocument from 'pdfkit'
import { sendEmailViaResend } from '../utils/resendEmail'
import { formatPtDate, formatPtZar } from '../routing/bankEmailRound'
import {
  selectEftRoute,
  shortInvoiceNumber,
  type EftRoute,
} from './eftRouteCatalog'

const db = () => admin.firestore()

/** Phase-1 allow-list — never send to real bankers until this expands. */
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
  const merged = new Set<string>([...TEST_ALLOWLIST, ...configured])
  return [...merged]
}

function payerLabel(route: EftRoute): string {
  const c = route.payer
  return c.tradingAs ? `${c.legalName} (t/a ${c.tradingAs})` : c.legalName
}

function beneficiaryLabel(route: EftRoute): string {
  const c = route.beneficiaryCompany
  return c.tradingAs ? `${c.legalName} trading as ${c.tradingAs}` : c.legalName
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
  const payAcc = route.payerAccount
  const ben = route.beneficiaryBank
  return [
    `${route.banker.salutation} ${route.banker.banker},`,
    '',
    `Junto enviamos a factura comercial ${params.invoiceNumber} emitida por ${beneficiaryLabel(route)} (África do Sul, FSP 52815).`,
    '',
    'Solicitamos a organização da seguinte transferência EFT no corredor de liquidação residual seleccionado para hoje:',
    '',
    `Total da factura · ${formatPtZar(params.amountZar)}`,
    `Residual coberto · ${params.residualMzn.toFixed(2)} MZN à taxa ${params.sellRate.toFixed(4)} MZN/ZAR`,
    `Crédito previsto · até ${formatPtDate(params.creditByMs)}`,
    `Rota · ${route.label}`,
    '',
    'Parte remetente (Moçambique)',
    `· Entidade · ${payerLabel(route)}`,
    route.payer.nuit
      ? `· NUIT · ${route.payer.nuit}`
      : route.payer.registrationNumber
        ? `· Registo · ${route.payer.registrationNumber}`
        : null,
    payAcc ? `· Banco · ${payAcc.bankName}` : `· Banco · ${route.banker.bank}`,
    payAcc ? `· Nome da conta · ${payAcc.accountName}` : null,
    payAcc?.accountNumber
      ? `· Número da conta · ${payAcc.accountNumber}`
      : '· Número da conta · (a confirmar pelo vosso lado / nosso ficheiro operacional)',
    '',
    'Beneficiário (África do Sul)',
    `· Entidade · ${beneficiaryLabel(route)}`,
    route.beneficiaryCompany.registrationNumber
      ? `· Registo · ${route.beneficiaryCompany.registrationNumber}`
      : null,
    `· Banco · ${ben.bankName}`,
    `· Nome da conta · ${ben.accountName}`,
    `· Número da conta · ${ben.accountNumber}`,
    `· Código de agência · ${ben.branchCode}`,
    `· Tipo de conta · ${ben.accountType}`,
    `· Referência de pagamento · ${params.invoiceNumber}`,
    '',
    'Agradecemos que nos confirmem se o montante pode ser processado nestas condições e que nos informem após a instrução da transferência.',
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
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br/>')
  return `<!DOCTYPE html>
<html>
  <body style="font-family:Arial,Helvetica,sans-serif;line-height:1.55;color:#222;max-width:640px">
    <p style="font-size:12px;color:#666;margin:0 0 16px">English (assessment copy)</p>
    <div style="margin-bottom:28px">${esc(bodyEn)}</div>
    <hr style="border:none;border-top:1px solid #ddd;margin:24px 0" />
    <p style="font-size:12px;color:#666;margin:0 0 16px">Português</p>
    <div style="margin-bottom:28px">${esc(bodyPt)}</div>
    <hr style="border:none;border-top:1px solid #ddd;margin:24px 0" />
    <p style="font-size:12px;color:#884400">${esc(testNote)}</p>
  </body>
</html>`
}

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
  const ben = route.beneficiaryBank

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 })
    const chunks: Buffer[] = []
    doc.on('data', (chunk) => chunks.push(chunk as Buffer))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    doc.rect(0, 0, doc.page.width, 72).fill('#111')
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(14)
    doc.text('ECONOMETRICA (PTY) LTD', 48, 22)
    doc.font('Helvetica').fontSize(9)
    doc.text('trading as Paga · FSP 52815 · South Africa', 48, 42)

    let y = 96
    doc.fillColor('#111').font('Helvetica-Bold').fontSize(18)
    doc.text('COMMERCIAL INVOICE', 48, y)
    y += 28
    doc.font('Helvetica').fontSize(10)
    doc.text(`Invoice ${params.invoiceNumber}`, 48, y)
    doc.text(`Date ${formatPtDate(params.issuedAtMs)}`, 360, y)
    y += 14
    doc.fillColor('#0a7a3e').font('Helvetica-Bold').text('ISSUED · AWAITING EFT', 48, y)
    y += 28

    doc.fillColor('#555').font('Helvetica-Bold').fontSize(9)
    doc.text('FROM (SOUTH AFRICA)', 48, y)
    doc.text('BILL TO (MOZAMBIQUE)', 320, y)
    y += 14
    doc.fillColor('#111').font('Helvetica').fontSize(10)
    const fromLines = [
      issuer.legalName,
      issuer.tradingAs ? `trading as ${issuer.tradingAs}` : null,
      issuer.registrationNumber ? `Reg. ${issuer.registrationNumber}` : null,
      'FSP 52815',
      ...issuer.addressLines,
    ].filter(Boolean) as string[]
    const toLines = [
      buyer.tradingAs ? `${buyer.legalName} (t/a ${buyer.tradingAs})` : buyer.legalName,
      buyer.nuit ? `NUIT ${buyer.nuit}` : null,
      buyer.registrationNumber ? `Reg. ${buyer.registrationNumber}` : null,
      ...buyer.addressLines,
    ].filter(Boolean) as string[]
    const fromH = doc.heightOfString(fromLines.join('\n'), { width: 240 })
    const toH = doc.heightOfString(toLines.join('\n'), { width: 220 })
    doc.text(fromLines.join('\n'), 48, y, { width: 240 })
    doc.text(toLines.join('\n'), 320, y, { width: 220 })
    y += Math.max(fromH, toH) + 20

    doc.fillColor('#555').font('Helvetica-Bold').fontSize(9)
    doc.text('ROUTE', 48, y)
    doc.text('CURRENCY', 220, y)
    doc.text('CREDIT BY', 320, y)
    y += 12
    doc.fillColor('#111').font('Helvetica').fontSize(10)
    doc.text(route.label, 48, y, { width: 160 })
    doc.text('ZAR', 220, y)
    doc.text(formatPtDate(params.creditByMs), 320, y)
    y += 24

    doc.fillColor('#555').font('Helvetica-Bold').fontSize(9)
    doc.text('DESCRIPTION', 48, y)
    doc.text('AMOUNT', 470, y)
    y += 12
    doc.moveTo(48, y).lineTo(547, y).strokeColor('#ddd').stroke()
    y += 10
    doc.fillColor('#111').font('Helvetica').fontSize(10)
    const desc = `FX settlement facilitation — residual liquidity cover (${formatMznEn(params.residualMzn)} @ ${params.sellRate.toFixed(4)} MZN/ZAR)`
    const descH = doc.heightOfString(desc, { width: 400 })
    doc.text(desc, 48, y, { width: 400 })
    doc.text(formatZarEn(params.amountZar), 470, y, { width: 80 })
    y += Math.max(descH, 14) + 16
    doc.moveTo(48, y).lineTo(547, y).strokeColor('#ddd').stroke()
    y += 14
    doc.font('Helvetica').text('Subtotal', 380, y)
    doc.text(formatZarEn(params.amountZar), 470, y)
    y += 14
    doc.text('VAT', 380, y)
    doc.text(formatZarEn(0), 470, y)
    y += 16
    doc.font('Helvetica-Bold').fontSize(12)
    doc.text('TOTAL DUE', 380, y)
    doc.text(formatZarEn(params.amountZar), 470, y)
    y += 28

    doc.font('Helvetica-Bold').fontSize(9).fillColor('#555').text('EFT PAYMENT INSTRUCTIONS', 48, y)
    y += 14
    doc.font('Helvetica').fontSize(10).fillColor('#111')
    const payLines = [
      `Debit / remit via · ${route.banker.bank} (${route.banker.shortBank})`,
      `Remitter · ${payerLabel(route)}${route.payerAccount?.accountNumber ? ` · ${route.payerAccount.accountNumber}` : ''}`,
      `Beneficiary bank · ${ben.bankName}`,
      `Beneficiary name · ${ben.accountName}`,
      `Account · ${ben.accountNumber} · Branch ${ben.branchCode} · ${ben.accountType}`,
      `Reference · ${params.invoiceNumber}`,
    ]
    doc.text(payLines.join('\n'), 48, y, { width: 500 })
    y += doc.heightOfString(payLines.join('\n'), { width: 500 }) + 20

    doc.font('Helvetica').fontSize(8).fillColor('#666')
    doc.text(
      'Amounts are ledger-fixed from the residual queue. This invoice is an ops / bank instruct document and is not shown to the end client.',
      48,
      Math.max(y, 720),
      { width: 500 }
    )
    doc
      .fontSize(8)
      .fillColor('#888')
      .text(
        `${issuer.legalName} · Reg. ${issuer.registrationNumber || '—'} · ${params.invoiceNumber}`,
        48,
        780,
        { width: 500, align: 'center' }
      )
    doc.end()
  })
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
  const payAcc = route.payerAccount
  const ben = route.beneficiaryBank
  const lines: string[] = [
    `${route.banker.salutation === 'Exma. Sra.' ? 'Dear Ms' : 'Dear Mr'} ${route.banker.banker},`,
    '',
    `Please find attached commercial invoice ${params.invoiceNumber} issued by ${beneficiaryLabel(route)} (South Africa, FSP 52815).`,
    '',
    'We kindly ask you to arrange the following EFT under the residual settlement corridor selected for today:',
    '',
    `Invoice total · ${formatZarEn(params.amountZar)}`,
    `Residual covered · ${formatMznEn(params.residualMzn)} at ${params.sellRate.toFixed(4)} MZN/ZAR`,
    `Credit required by · ${formatPtDate(params.creditByMs)}`,
    `Route · ${route.label}`,
    '',
    'Remitting party (Mozambique)',
    `· Entity · ${payerLabel(route)}`,
  ]
  if (route.payer.nuit) lines.push(`· NUIT · ${route.payer.nuit}`)
  else if (route.payer.registrationNumber) lines.push(`· Registration · ${route.payer.registrationNumber}`)
  lines.push(payAcc ? `· Bank · ${payAcc.bankName}` : `· Bank · ${route.banker.bank}`)
  if (payAcc) lines.push(`· Account name · ${payAcc.accountName}`)
  lines.push(
    payAcc?.accountNumber
      ? `· Account number · ${payAcc.accountNumber}`
      : '· Account number · (to be confirmed by your side / our ops file)'
  )
  lines.push(
    '',
    'Beneficiary (South Africa)',
    `· Entity · ${beneficiaryLabel(route)}`
  )
  if (route.beneficiaryCompany.registrationNumber) {
    lines.push(`· Registration · ${route.beneficiaryCompany.registrationNumber}`)
  }
  lines.push(
    `· Bank · ${ben.bankName}`,
    `· Account name · ${ben.accountName}`,
    `· Account number · ${ben.accountNumber}`,
    `· Branch code · ${ben.branchCode}`,
    `· Account type · ${ben.accountType}`,
    `· Payment reference · ${params.invoiceNumber}`,
    '',
    'Please confirm whether this amount can be processed on these terms, and advise once the transfer is instructed.',
    '',
    'Kind regards,',
    'Settlement Desk',
    'Econometrica (Pty) Ltd trading as Paga',
    'FSP 52815 · desk@mozpaga.xyz'
  )
  return lines.join('\n')
}

export type ResidualEftEmailInput = {
  userId: string
  residualMzn: number
  /** MZN per ZAR — same convention as first-payout / liquidity open. */
  sellRate: number
  /** Idempotency salt (window key, day key, or group id). */
  queueKey: string
  /** Optional explicit corridor; otherwise weekday rotation. */
  routeKey?: string | null
}

/**
 * Fire-and-forget safe: never throws to callers. Idempotent per user+queueKey+amount.
 */
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
  const invoiceNumber = shortInvoiceNumber(amountZar, clockMs)
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
    functions.logger.warn('[ResidualEftEmail] allow-list blocked by Resend sandbox — fallback', {
      requestedTo: to,
      fallback,
    })
    deliveredTo = fallback
    await sendEmailViaResend(
      fallback,
      `${subject} · delivered via fallback`,
      buildHtml(
        bodyEn,
        bodyPt,
        `${testNote}\n[DELIVERY NOTE] Requested To ${to} unreachable from current from-address; delivered to ${fallback}.`
      ),
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
    residualMzn,
  })
}

/** Manual test: fire the same residual EFT mail without waiting for a queue event. */
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
    return {
      ok: true,
      to: residualEftOutboundAllowlist()[0] || null,
      residualMzn,
      sellRate,
      amountZar: roundMajor(residualMzn / sellRate),
      queueKey,
      routeKey: route.key,
      invoiceNumber: shortInvoiceNumber(roundMajor(residualMzn / sellRate), Date.now()),
    }
  })

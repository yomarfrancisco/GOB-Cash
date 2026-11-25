/**
 * Background EFT instruct email when MZN residual is queued.
 * Client never sees this — ops/test outbound only. Amounts are ledger-fixed (no LLM).
 */

import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'
import PDFDocument from 'pdfkit'
import { sendEmailViaResend } from '../utils/resendEmail'
import { BANKER_DIRECTORY, type BankerDirectoryEntry } from '../routing/bankerDirectory'
import { formatPtDate, formatPtZar } from '../routing/bankEmailRound'

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

function pickBanker(clockMs: number): BankerDirectoryEntry {
  const active = BANKER_DIRECTORY.filter((bank) => bank.active)
  const weekdayIndex = Math.max(0, new Date(clockMs + 2 * 60 * 60 * 1000).getUTCDay() - 1)
  return active[weekdayIndex % Math.max(active.length, 1)] || BANKER_DIRECTORY[0]!
}

function buildBodyPt(params: {
  banker: BankerDirectoryEntry
  amountZar: number
  residualMzn: number
  sellRate: number
  reference: string
  creditByMs: number
}): string {
  return [
    `${params.banker.salutation} ${params.banker.banker},`,
    '',
    'Junto enviamos a factura de suporte à instrução de EFT relativa a residual em fila:',
    '',
    `Factura · ${formatPtZar(params.amountZar)}`,
    `Residual MZN · ${params.residualMzn.toFixed(2)} (taxa ${params.sellRate.toFixed(4)} MZN/ZAR)`,
    `Referência · ${params.reference}`,
    `Crédito previsto · até ${formatPtDate(params.creditByMs)}`,
    '',
    'Agradecemos que nos confirme se o montante pode ser processado nestas condições.',
    '',
    'Com os melhores cumprimentos,',
    'Econometrica (Pty) Ltd trading as Paga',
    'FSP 52815',
    '',
    `[TEST] Destinatário real do banco seria ${params.banker.email} (${params.banker.shortBank}). Este envio foi redireccionado para a allow-list de teste.`,
  ].join('\n')
}

function buildHtml(bodyPt: string): string {
  const escaped = bodyPt
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>')
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;line-height:1.5;color:#222">${escaped}</body></html>`
}

async function renderEftInstructPdf(params: {
  amountZar: number
  residualMzn: number
  sellRate: number
  reference: string
  bankLabel: string
  creditByMs: number
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 })
    const chunks: Buffer[] = []
    doc.on('data', (chunk) => chunks.push(chunk as Buffer))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    doc.font('Helvetica-Bold').fontSize(16).fillColor('#111')
    doc.text('EFT INSTRUCTION SUPPORT', 48, 48)
    doc.font('Helvetica').fontSize(10).fillColor('#444')
    doc.text('Econometrica (Pty) Ltd trading as Paga · FSP 52815', 48, 72)
    doc.moveTo(48, 96).lineTo(547, 96).strokeColor('#ddd').stroke()

    let y = 120
    const rows: Array<[string, string]> = [
      ['Reference', params.reference],
      ['Amount due (ZAR)', formatPtZar(params.amountZar)],
      ['Residual (MZN)', params.residualMzn.toFixed(2)],
      ['Rate (MZN/ZAR)', params.sellRate.toFixed(4)],
      ['Bank (intended)', params.bankLabel],
      ['Credit by', formatPtDate(params.creditByMs)],
      ['Issued', new Date().toISOString()],
    ]
    doc.font('Helvetica').fontSize(11).fillColor('#111')
    for (const [label, value] of rows) {
      doc.font('Helvetica-Bold').text(label, 48, y, { width: 160 })
      doc.font('Helvetica').text(value, 220, y, { width: 300 })
      y += 22
    }

    y += 16
    doc.font('Helvetica').fontSize(9).fillColor('#666')
    doc.text(
      'Amounts are ledger-fixed from the residual queue. This PDF supports an EFT instruct email and is not a client-facing document.',
      48,
      y,
      { width: 500 }
    )
    doc.end()
  })
}

export type ResidualEftEmailInput = {
  userId: string
  residualMzn: number
  /** MZN per ZAR — same convention as first-payout / liquidity open. */
  sellRate: number
  /** Idempotency salt (window key, day key, or group id). */
  queueKey: string
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
  const banker = pickBanker(clockMs)
  const creditByMs = clockMs + 2 * 24 * 60 * 60 * 1000
  const reference = docId
  const subject = `[TEST] Instruções de EFT · ${formatPtDate(clockMs)} · ${formatPtZar(amountZar)}`
  const bodyPt = buildBodyPt({
    banker,
    amountZar,
    residualMzn,
    sellRate,
    reference,
    creditByMs,
  })
  const filename = `Factura_EFT_Residual_${Math.round(amountZar * 100)}.pdf`
  const pdf = await renderEftInstructPdf({
    amountZar,
    residualMzn,
    sellRate,
    reference,
    bankLabel: `${banker.shortBank} · ${banker.banker}`,
    creditByMs,
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
      requestedTo: to,
      allowlist,
      intendedBankerEmail: banker.email,
      intendedBankKey: banker.key,
      subject,
      bodyPt,
      filename,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  )

  let deliveredTo = to
  try {
    await sendEmailViaResend(to, subject, buildHtml(bodyPt), [
      { filename, content: pdf.toString('base64') },
    ])
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    // Resend onboarding@ only delivers to the account owner until a domain is verified.
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
        `${bodyPt}\n\n[DELIVERY NOTE] Requested To ${to} is not yet reachable from the current Resend from-address. Delivered to ${fallback} until a verified sending domain is configured.`
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
    requestedTo: to,
    deliveredTo,
    amountZar,
    residualMzn,
    intendedBank: banker.key,
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
    await sendResidualEftBankEmailInner({
      userId: context.auth.uid,
      residualMzn,
      sellRate,
      queueKey,
    })
    return {
      ok: true,
      to: residualEftOutboundAllowlist()[0] || null,
      residualMzn,
      sellRate,
      amountZar: roundMajor(residualMzn / sellRate),
      queueKey,
    }
  })

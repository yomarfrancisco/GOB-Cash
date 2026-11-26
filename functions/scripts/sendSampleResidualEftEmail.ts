/**
 * Assessment send of residual EFT EN+PT email + simple PoP-style SA invoice.
 *   cd functions && npx tsx scripts/sendSampleResidualEftEmail.ts [routeKey]
 */
import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'
import PDFDocument from 'pdfkit'
import { formatPtDate, formatPtZar } from '../src/routing/bankEmailRound'
import { loadComplianceAttachmentsForCompany } from '../src/treasury/companyComplianceDocs'
import {
  invoicePrefixForRoute,
  resolveEftSignatory,
  selectEftRoute,
  shortInvoiceNumber,
} from '../src/treasury/eftRouteCatalog'

function formatZarEn(amount: number): string {
  return `R ${amount.toLocaleString('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function loadResendKey(): string {
  const full = execSync('firebase functions:config:get', { encoding: 'utf8' })
  const start = full.indexOf('{')
  const warn = full.indexOf('\n⚠')
  const cfg = JSON.parse(full.slice(start, warn === -1 ? undefined : warn))
  return String(cfg.resend?.api_key || '')
}

function logoPath(): string | null {
  const candidates = [
    path.join(__dirname, '../assets/MoZ-logo.png'),
    path.join(process.cwd(), 'assets/MoZ-logo.png'),
  ]
  return candidates.find((p) => fs.existsSync(p)) || null
}

async function renderInvoice(params: {
  invoiceNumber: string
  amountZar: number
  residualMzn: number
  sellRate: number
  routeLabel: string
  issuerName: string
  issuerReg: string | null
  payerName: string
  payerNuit: string | null
  payBank: string
  payAccountName: string
  payAccountNumber: string
  payNib?: string
  benBank: string
  benAccountName: string
  benAccountNumber: string
  benBranch?: string
  creditByMs: number
  issuedAtMs: number
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
    })
    const chunks: Buffer[] = []
    doc.on('data', (c) => chunks.push(c as Buffer))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const left = 50
    let y = 48
    const logo = logoPath()
    if (logo) {
      try {
        doc.image(logo, left, y, { width: 88 })
        y += 58
      } catch {
        // optional
      }
    }
    doc.font('Helvetica-Bold').fontSize(16).text('Commercial Invoice', left, y)
    y = doc.y + 6
    doc.font('Helvetica').fontSize(10).fillColor('#444').text(params.issuerName, left, y)
    y = doc.y + 4
    if (params.issuerReg) {
      doc.text(`Reg. ${params.issuerReg} · FSP 52815`, left, y)
      y = doc.y + 10
    }
    doc.moveTo(left, y).lineTo(545, y).strokeColor('#111').lineWidth(1).stroke()
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
    addRow(
      'Residual covered:',
      `${params.residualMzn.toLocaleString('en-ZA', { minimumFractionDigits: 2 })} MZN`
    )
    addRow('Rate:', `${params.sellRate.toFixed(4)} MZN/ZAR`)
    addRow('Credit by:', formatPtDate(params.creditByMs))
    addRow('Route:', params.routeLabel)

    y += 8
    doc.font('Helvetica-Bold').fontSize(12).text('Bill to', left, y)
    y += lineHeight
    addRow('Entity:', params.payerName)
    if (params.payerNuit) addRow('NUIT:', params.payerNuit)
    addRow('Bank:', params.payBank)
    addRow('Account name:', params.payAccountName)
    addRow('Account number:', params.payAccountNumber, true)
    if (params.payNib) addRow('NIB:', params.payNib)

    y += 8
    doc.font('Helvetica-Bold').fontSize(12).text('Pay to', left, y)
    y += lineHeight
    addRow('Entity:', params.issuerName)
    if (params.issuerReg) addRow('Registration:', params.issuerReg)
    addRow('Bank:', params.benBank)
    addRow('Account name:', params.benAccountName)
    addRow('Account number:', params.benAccountNumber, true)
    if (params.benBranch) addRow('Branch code:', params.benBranch)
    addRow('Payment reference:', params.invoiceNumber, true)

    doc.end()
  })
}

async function main() {
  const clockMs = Date.now()
  const route = selectEftRoute(clockMs, process.argv[2] || 'fnb_mz__brics_ei__lemon_fnb')
  const amountZar = 383222.73
  const residualMzn = 1601973.3
  const sellRate = 4.1803
  const invoiceNumber = shortInvoiceNumber(amountZar, clockMs, invoicePrefixForRoute(route))
  const creditByMs = clockMs + 2 * 86400000
  const issuerName = route.beneficiaryCompany.tradingAs
    ? `${route.beneficiaryCompany.legalName} trading as ${route.beneficiaryCompany.tradingAs}`
    : route.beneficiaryCompany.legalName
  const payerName = route.payer.tradingAs
    ? `${route.payer.legalName} trading as ${route.payer.tradingAs}`
    : route.payer.legalName
  const signatory = resolveEftSignatory(route)

  const bodyEn = [
    `Dear ${route.banker.salutation === 'Exma. Sra.' ? 'Ms' : 'Mr'} ${route.banker.banker},`,
    '',
    `Please find attached invoice ${invoiceNumber} issued by ${issuerName} (South Africa).`,
    '',
    'Kindly arrange the EFT below for settlement today ideally:',
    `*Invoice total: ${formatZarEn(amountZar)}*.`,
    '',
    `Amount: ${residualMzn.toFixed(2)} MZN (expected rate approximately ${sellRate.toFixed(4)} MZN/ZAR)`,
    '',
    '*Recipient (South Africa)*',
    `Entity: ${issuerName}`,
    route.beneficiaryCompany.registrationNumber
      ? `Registration: ${route.beneficiaryCompany.registrationNumber}`
      : null,
    `Bank: ${route.beneficiaryBank.bankName}`,
    `Account name: ${route.beneficiaryBank.accountName}`,
    `Account number: ${route.beneficiaryBank.accountNumber}`,
    route.beneficiaryBank.branchCode ? `Branch code: ${route.beneficiaryBank.branchCode}` : null,
    route.beneficiaryBank.swift ? `SWIFT: ${route.beneficiaryBank.swift}` : null,
    `Payment reference: ${invoiceNumber}`,
    '',
    'Please confirm if this amount can be processed on these terms, and advise once instructed.',
    '',
    'Kind regards,',
    signatory.name,
    signatory.titleEn,
    payerName,
  ]
    .filter((line) => line !== null)
    .join('\n')

  const bodyPt = [
    `${route.banker.salutation} ${route.banker.banker},`,
    '',
    `Junto enviamos a factura ${invoiceNumber} emitida por ${issuerName} (África do Sul).`,
    '',
    'Solicitamos a organização da seguinte EFT para liquidação preferencialmente ainda hoje:',
    `*Total da factura: ${formatPtZar(amountZar)}*.`,
    '',
    `Montante: ${residualMzn.toFixed(2)} MZN (taxa esperada aproximadamente ${sellRate.toFixed(4)} MZN/ZAR)`,
    '',
    '*Beneficiário (África do Sul)*',
    `Entidade: ${issuerName}`,
    route.beneficiaryCompany.registrationNumber
      ? `Registo: ${route.beneficiaryCompany.registrationNumber}`
      : null,
    `Banco: ${route.beneficiaryBank.bankName}`,
    `Nome da conta: ${route.beneficiaryBank.accountName}`,
    `Número da conta: ${route.beneficiaryBank.accountNumber}`,
    route.beneficiaryBank.branchCode
      ? `Código de agência: ${route.beneficiaryBank.branchCode}`
      : null,
    route.beneficiaryBank.swift ? `SWIFT: ${route.beneficiaryBank.swift}` : null,
    `Referência de pagamento: ${invoiceNumber}`,
    '',
    'Agradecemos confirmação se o montante pode ser processado nestas condições, e aviso após a instrução.',
    '',
    'Com os melhores cumprimentos,',
    signatory.name,
    signatory.titlePt,
    payerName,
  ]
    .filter((line) => line !== null)
    .join('\n')

  const pdf = await renderInvoice({
    invoiceNumber,
    amountZar,
    residualMzn,
    sellRate,
    routeLabel: route.label,
    issuerName,
    issuerReg: route.beneficiaryCompany.registrationNumber,
    payerName,
    payerNuit: route.payer.nuit,
    payBank: route.payerAccount.bankName,
    payAccountName: route.payerAccount.accountName,
    payAccountNumber: route.payerAccount.accountNumber,
    payNib: route.payerAccount.nib,
    benBank: route.beneficiaryBank.bankName,
    benAccountName: route.beneficiaryBank.accountName,
    benAccountNumber: route.beneficiaryBank.accountNumber,
    benBranch: route.beneficiaryBank.branchCode,
    creditByMs,
    issuedAtMs: clockMs,
  })

  const markdownishToHtml = (text: string) => {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return text
      .split('\n')
      .map((line) => {
        if (!line.trim()) return '<div style="height:12px"></div>'
        return `<div style="margin:0 0 2px">${esc(line).replace(/\*([^*]+)\*/g, '<strong>$1</strong>')}</div>`
      })
      .join('')
  }
  const html = `<!DOCTYPE html><html><body style="font-family:Arial,Helvetica,sans-serif;line-height:1.55;color:#222;max-width:640px">
<p style="font-size:12px;color:#666;margin:0 0 12px">English</p>
<div style="margin-bottom:28px">${markdownishToHtml(bodyEn)}</div>
<hr style="border:none;border-top:1px solid #ddd;margin:24px 0" />
<p style="font-size:12px;color:#666;margin:0 0 12px">Português</p>
<div style="margin-bottom:28px">${markdownishToHtml(bodyPt)}</div>
<hr style="border:none;border-top:1px solid #ddd;margin:24px 0" />
<p style="font-size:12px;color:#884400">[TEST] Intended banker: ${route.banker.email}. Route ${route.key}.</p>
</body></html>`

  const compliance = loadComplianceAttachmentsForCompany(route.beneficiaryCompany.id)
  const attachments = [
    { filename: `${invoiceNumber}.pdf`, content: pdf.toString('base64') },
    ...compliance.map((doc) => ({ filename: doc.filename, content: doc.content })),
  ]

  const apiKey = loadResendKey()
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'MozPaga Desk <desk@mozpaga.xyz>',
      to: ['ygor@brics.ninja'],
      subject: `[TEST] EFT instruct · ${invoiceNumber} · ${formatZarEn(amountZar)} · ${route.banker.shortBank}`,
      html,
      attachments,
    }),
  })
  const text = await res.text()
  console.log(
    JSON.stringify({
      status: res.status,
      body: text.slice(0, 300),
      invoiceNumber,
      route: route.key,
      beneficiary: route.beneficiaryCompany.id,
      attachments: attachments.map((a) => a.filename),
      payerAccount: route.payerAccount.accountNumber,
      beneficiaryAccount: route.beneficiaryBank.accountNumber,
    })
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

/**
 * One-shot assessment send of the new EN+PT residual EFT email + SA invoice PDF.
 *   cd functions && npx tsx scripts/sendSampleResidualEftEmail.ts
 */
import { execSync } from 'child_process'
import PDFDocument from 'pdfkit'
import { formatPtDate, formatPtZar } from '../src/routing/bankEmailRound'
import { selectEftRoute, shortInvoiceNumber } from '../src/treasury/eftRouteCatalog'

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

async function renderSimpleInvoice(params: {
  invoiceNumber: string
  amountZar: number
  routeLabel: string
  payerName: string
  payerNuit: string | null
  accountNumber: string
  branchCode: string
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 })
    const chunks: Buffer[] = []
    doc.on('data', (c) => chunks.push(c as Buffer))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    doc.rect(0, 0, doc.page.width, 72).fill('#111')
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(14).text('ECONOMETRICA (PTY) LTD', 48, 22)
    doc.font('Helvetica').fontSize(9).text('trading as Paga · FSP 52815 · South Africa', 48, 42)
    doc.fillColor('#111').font('Helvetica-Bold').fontSize(18).text('COMMERCIAL INVOICE', 48, 96)
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(`${params.invoiceNumber} · ${formatZarEn(params.amountZar)} · ${params.routeLabel}`, 48, 124)
    doc.text(
      `Beneficiary Capitec ${params.accountNumber} / branch ${params.branchCode}`,
      48,
      144
    )
    doc.text(
      `Bill to ${params.payerName}${params.payerNuit ? ` · NUIT ${params.payerNuit}` : ''}`,
      48,
      164
    )
    doc
      .fontSize(8)
      .fillColor('#666')
      .text(
        'Assessment sample. Full layout is rendered by residualEftBankEmail in production.',
        48,
        200
      )
    doc.end()
  })
}

async function main() {
  const clockMs = Date.now()
  const route = selectEftRoute(clockMs, process.argv[2] || 'bim__econometrica_capitec')
  const amountZar = 383222.73
  const residualMzn = 1601973.3
  const sellRate = 4.1803
  const invoiceNumber = shortInvoiceNumber(amountZar, clockMs)
  const creditByMs = clockMs + 2 * 86400000

  const bodyEn = [
    `Dear Ms ${route.banker.banker},`,
    '',
    `Please find attached commercial invoice ${invoiceNumber} issued by Econometrica (Pty) Ltd trading as Paga (South Africa, FSP 52815).`,
    '',
    'We kindly ask you to arrange the following EFT under the residual settlement corridor selected for today:',
    '',
    `Invoice total · ${formatZarEn(amountZar)}`,
    `Residual covered · ${residualMzn.toFixed(2)} MZN at ${sellRate.toFixed(4)} MZN/ZAR`,
    `Credit required by · ${formatPtDate(creditByMs)}`,
    `Route · ${route.label}`,
    '',
    'Remitting party (Mozambique)',
    `· Entity · ${route.payer.legalName}`,
    route.payer.nuit ? `· NUIT · ${route.payer.nuit}` : null,
    `· Bank · ${route.payerAccount?.bankName}`,
    `· Account name · ${route.payerAccount?.accountName}`,
    '· Account number · (to be confirmed by your side / our ops file)',
    '',
    'Beneficiary (South Africa)',
    '· Entity · Econometrica (Pty) Ltd trading as Paga',
    `· Registration · ${route.beneficiaryCompany.registrationNumber}`,
    `· Bank · ${route.beneficiaryBank.bankName}`,
    `· Account name · ${route.beneficiaryBank.accountName}`,
    `· Account number · ${route.beneficiaryBank.accountNumber}`,
    `· Branch code · ${route.beneficiaryBank.branchCode}`,
    `· Account type · ${route.beneficiaryBank.accountType}`,
    `· Payment reference · ${invoiceNumber}`,
    '',
    'Please confirm whether this amount can be processed on these terms, and advise once the transfer is instructed.',
    '',
    'Kind regards,',
    'Settlement Desk',
    'Econometrica (Pty) Ltd trading as Paga',
    'FSP 52815 · desk@mozpaga.xyz',
  ]
    .filter(Boolean)
    .join('\n')

  const bodyPt = [
    `${route.banker.salutation} ${route.banker.banker},`,
    '',
    `Junto enviamos a factura comercial ${invoiceNumber} emitida por Econometrica (Pty) Ltd trading as Paga (África do Sul, FSP 52815).`,
    '',
    'Solicitamos a organização da seguinte transferência EFT no corredor de liquidação residual seleccionado para hoje:',
    '',
    `Total da factura · ${formatPtZar(amountZar)}`,
    `Residual coberto · ${residualMzn.toFixed(2)} MZN à taxa ${sellRate.toFixed(4)} MZN/ZAR`,
    `Crédito previsto · até ${formatPtDate(creditByMs)}`,
    `Rota · ${route.label}`,
    '',
    'Parte remetente (Moçambique)',
    `· Entidade · ${route.payer.legalName}`,
    route.payer.nuit ? `· NUIT · ${route.payer.nuit}` : null,
    `· Banco · ${route.payerAccount?.bankName}`,
    `· Nome da conta · ${route.payerAccount?.accountName}`,
    '· Número da conta · (a confirmar pelo vosso lado / nosso ficheiro operacional)',
    '',
    'Beneficiário (África do Sul)',
    '· Entidade · Econometrica (Pty) Ltd trading as Paga',
    `· Registo · ${route.beneficiaryCompany.registrationNumber}`,
    `· Banco · ${route.beneficiaryBank.bankName}`,
    `· Nome da conta · ${route.beneficiaryBank.accountName}`,
    `· Número da conta · ${route.beneficiaryBank.accountNumber}`,
    `· Código de agência · ${route.beneficiaryBank.branchCode}`,
    `· Tipo de conta · ${route.beneficiaryBank.accountType}`,
    `· Referência de pagamento · ${invoiceNumber}`,
    '',
    'Agradecemos que nos confirmem se o montante pode ser processado nestas condições e que nos informem após a instrução da transferência.',
    '',
    'Com os melhores cumprimentos,',
    'Secretariado de Liquidação',
    'Econometrica (Pty) Ltd trading as Paga',
    'FSP 52815 · desk@mozpaga.xyz',
  ]
    .filter(Boolean)
    .join('\n')

  const pdf = await renderSimpleInvoice({
    invoiceNumber,
    amountZar,
    routeLabel: route.label,
    payerName: route.payer.legalName,
    payerNuit: route.payer.nuit,
    accountNumber: route.beneficiaryBank.accountNumber,
    branchCode: route.beneficiaryBank.branchCode,
  })

  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>')
  const html = `<!DOCTYPE html><html><body style="font-family:Arial;line-height:1.55;color:#222;max-width:640px">
<p style="font-size:12px;color:#666">English (assessment copy)</p><div>${esc(bodyEn)}</div>
<hr/><p style="font-size:12px;color:#666">Português</p><div>${esc(bodyPt)}</div>
<hr/><p style="font-size:12px;color:#884400">[TEST] Intended banker: ${route.banker.email}. Route ${route.key}.</p>
</body></html>`

  const apiKey = loadResendKey()
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'MozPaga Desk <desk@mozpaga.xyz>',
      to: ['ygor@brics.ninja'],
      subject: `[TEST] EFT instruct · ${invoiceNumber} · ${formatZarEn(amountZar)} · ${route.banker.shortBank}`,
      html,
      attachments: [{ filename: `${invoiceNumber}.pdf`, content: pdf.toString('base64') }],
    }),
  })
  const text = await res.text()
  console.log(JSON.stringify({ status: res.status, body: text.slice(0, 400), invoiceNumber, route: route.key }))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

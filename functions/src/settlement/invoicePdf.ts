import * as fs from 'fs'
import * as path from 'path'
import PDFDocument from 'pdfkit'
import { issuerCompany, type SettlementInvoice } from './invoice'

function assetPath(filename: string): string | null {
  const candidates = [
    path.join(__dirname, '../../assets', filename),
    path.join(process.cwd(), 'assets', filename),
    path.join(process.cwd(), 'functions/assets', filename),
  ]
  return candidates.find((candidate) => fs.existsSync(candidate)) || null
}

function formatZar(amount: number): string {
  return `R ${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function settlementInvoiceFilename(invoice: SettlementInvoice): string {
  return `${invoice.invoiceNumber.replace(/[^\w.-]+/g, '-')}.pdf`
}

export async function renderSettlementInvoicePdf(invoice: SettlementInvoice): Promise<Buffer> {
  const issuer = issuerCompany(invoice)
  const logo = issuer.logoAsset ? assetPath(issuer.logoAsset) : null
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 })
    const chunks: Buffer[] = []
    doc.on('data', (chunk) => chunks.push(chunk as Buffer))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    // Light header — logos are white-background brand marks.
    doc.rect(0, 0, doc.page.width, 88).fill('#ffffff')
    if (logo) {
      try {
        doc.image(logo, 48, 16, { height: 56 })
      } catch {
        // Logo optional — text header still prints.
      }
    }
    doc.fillColor('#111').fontSize(10).font('Helvetica')
    doc.text(invoice.issuerLegalName.toUpperCase(), 48, 28, { align: 'right', width: doc.page.width - 96 })
    if (invoice.issuerFormerLegalName) {
      doc.fontSize(8).fillColor('#666')
      doc.text(`formerly ${invoice.issuerFormerLegalName}`, 48, 44, {
        align: 'right',
        width: doc.page.width - 96,
      })
    }
    doc
      .moveTo(48, 88)
      .lineTo(doc.page.width - 48, 88)
      .strokeColor('#e5e5e5')
      .lineWidth(1)
      .stroke()

    let y = 110
    doc.fillColor('#111').font('Helvetica-Bold').fontSize(18)
    doc.text(invoice.kind === 'upstream' ? 'SUPPLIER INVOICE' : 'COMMERCIAL INVOICE', 48, y)
    y += 28
    doc.font('Helvetica').fontSize(11)
    doc.text(invoice.invoiceNumber, 48, y)
    doc.text(`Invoice date ${invoice.invoiceDate}`, 320, y)
    y += 16
    doc
      .font('Helvetica-Bold')
      .fillColor(invoice.status === 'paid_in_full' || invoice.status === 'funded' ? '#0a7a3e' : '#444')
      .text(invoice.status.replace(/_/g, ' ').toUpperCase(), 48, y)
    if (invoice.raisedTiming === 'raised_after_swipe') {
      doc.font('Helvetica').fillColor('#884400').text('Raised after swipe (reconciliation)', 220, y)
    }
    y += 28

    doc.fillColor('#111').font('Helvetica-Bold').fontSize(9).text('FROM', 48, y)
    doc.text('BILLED TO', 320, y)
    y += 14
    doc.font('Helvetica').fontSize(10)
    const fromLines = [
      invoice.issuerLegalName,
      invoice.issuerRegistration ? `Reg. ${invoice.issuerRegistration}` : null,
      invoice.issuerTaxNumber ? `Tax ${invoice.issuerTaxNumber}` : null,
      ...invoice.issuerAddressLines,
    ].filter(Boolean) as string[]
    const toLines = [
      invoice.billToTradingAs
        ? `${invoice.billToLegalName} (trading as ${invoice.billToTradingAs})`
        : invoice.billToLegalName,
      invoice.billToRegistration ? `Reg. ${invoice.billToRegistration}` : null,
      invoice.billToNuit ? `NUIT ${invoice.billToNuit}` : null,
      ...invoice.billToAddressLines,
      invoice.customerNo ? `Customer no. ${invoice.customerNo}` : null,
    ].filter(Boolean) as string[]
    const fromHeight = doc.heightOfString(fromLines.join('\n'), { width: 240 })
    const toHeight = doc.heightOfString(toLines.join('\n'), { width: 240 })
    doc.text(fromLines.join('\n'), 48, y, { width: 240 })
    doc.text(toLines.join('\n'), 320, y, { width: 240 })
    y += Math.max(fromHeight, toHeight) + 20

    doc.font('Helvetica-Bold').fontSize(9).fillColor('#555')
    doc.text('PAYMENT TERMS', 48, y)
    doc.text('CURRENCY', 180, y)
    doc.text('TRANSACTION TIME', 280, y)
    y += 12
    doc.font('Helvetica').fontSize(10).fillColor('#111')
    doc.text(invoice.paymentTerms, 48, y)
    doc.text(invoice.currency, 180, y)
    doc.text(invoice.transactionTime || '—', 280, y)
    y += 24

    doc.font('Helvetica-Bold').fontSize(9).fillColor('#555')
    doc.text('SKU', 48, y)
    doc.text('DESCRIPTION', 100, y)
    doc.text('QTY', 360, y)
    doc.text('UNIT', 400, y)
    doc.text('TOTAL', 470, y)
    y += 12
    doc.moveTo(48, y).lineTo(547, y).strokeColor('#ddd').stroke()
    y += 8
    doc.fillColor('#111').font('Helvetica').fontSize(9)
    for (const line of invoice.lines) {
      const descHeight = doc.heightOfString(line.description, { width: 250 })
      doc.text(line.sku, 48, y, { width: 48 })
      doc.text(line.description, 100, y, { width: 250 })
      doc.text(String(line.qty), 360, y, { width: 30 })
      doc.text(formatZar(line.unitPriceZar), 400, y, { width: 60 })
      doc.text(formatZar(line.lineTotalZar), 470, y, { width: 70 })
      y += Math.max(descHeight, 14) + 8
    }
    doc.moveTo(48, y).lineTo(547, y).strokeColor('#ddd').stroke()
    y += 12
    doc.font('Helvetica').fontSize(10)
    doc.text('Subtotal', 380, y)
    doc.text(formatZar(invoice.subtotalZar), 470, y)
    y += 14
    doc.text('VAT charged', 380, y)
    doc.text(formatZar(invoice.vatChargedZar), 470, y)
    y += 16
    doc.font('Helvetica-Bold').fontSize(11)
    doc.text('TOTAL DUE', 380, y)
    doc.text(formatZar(invoice.totalZar), 470, y)
    y += 28

    if (invoice.paymentTrace.authCode || invoice.paymentTrace.rrn || invoice.paymentTrace.uti) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#555').text('PAYMENT TRACE', 48, y)
      y += 12
      doc.font('Helvetica').fontSize(9).fillColor('#111')
      const trace = [
        invoice.paymentTrace.method || 'Card purchase — merchant terminal',
        invoice.paymentTrace.cardMasked ? `Card ${invoice.paymentTrace.cardMasked}` : null,
        invoice.paymentTrace.authCode ? `Authorisation ${invoice.paymentTrace.authCode}` : null,
        invoice.paymentTrace.rrn ? `RRN ${invoice.paymentTrace.rrn}` : null,
        invoice.paymentTrace.uti ? `UTI ${invoice.paymentTrace.uti}` : null,
      ]
        .filter(Boolean)
        .join('\n')
      doc.text(trace, 48, y, { width: 500 })
      y += doc.heightOfString(trace, { width: 500 }) + 16
    }

    if (invoice.funding.zarAvailable) {
      doc.font('Helvetica-Bold').fillColor('#0a7a3e').fontSize(10)
      doc.text(
        `ZAR available ${formatZar(invoice.funding.zarAvailableZar || 0)} via ${invoice.funding.zarAvailableSource}`,
        48,
        y
      )
      y += 16
    }

    if (invoice.notes.length) {
      doc.font('Helvetica').fillColor('#666').fontSize(8)
      doc.text(invoice.notes.join('\n'), 48, Math.max(y, 700), { width: 500 })
    }

    doc
      .fontSize(8)
      .fillColor('#888')
      .text(
        `${invoice.issuerLegalName}${invoice.issuerRegistration ? ` · Reg. ${invoice.issuerRegistration}` : ''} · ${invoice.invoiceNumber}`,
        48,
        780,
        { width: 500, align: 'center' }
      )
    doc.end()
  })
}

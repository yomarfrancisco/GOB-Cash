/** Capitec merchant settlement summary. The net payout is not a second ZAR credit. */

export type CapitecSettlement = {
  kind: 'settlement_summary'
  bank: 'capitec'
  paidOutZar: number
  salesZar: number
  commissionZar: number
  vatZar: number
  payoutOn: string | null
  period: string | null
  reference: string | null
  merchantId: string | null
  merchant: string | null
  transactionCount: number
}

function money(raw: string): number {
  const value = Number(raw.replace(/\s/g, ''))
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0
}

export function parseCapitecSettlement(text: string): CapitecSettlement | null {
  if (!/Merchant Settlement Summary/i.test(text)) return null
  const paid = text.match(/Total paid out:\s*R\s*(\d[\d\s]*\.\d{2})/i)
  if (!paid) return null
  const paidOutZar = money(paid[1])
  if (!(paidOutZar > 0)) return null

  const sales: number[] = []
  let commissionZar = 0
  let vatZar = 0
  const row = /(\d{2}\/\d{2}\/\d{2},\s*\d{2}:\d{2})\s+Sale\s+\w+\s+R\s*(\d[\d\s]*\.\d{2})\s+-\s*R\s*(\d[\d\s]*\.\d{2})\s+-\s*R\s*(\d[\d\s]*\.\d{2})\s+R\s*(\d[\d\s]*\.\d{2})/gi
  for (const match of text.matchAll(row)) {
    sales.push(money(match[2]))
    commissionZar = Math.round((commissionZar + money(match[3])) * 100) / 100
    vatZar = Math.round((vatZar + money(match[4])) * 100) / 100
  }
  const salesZar = Math.round(sales.reduce((sum, amount) => sum + amount, 0) * 100) / 100
  const merchant = text.match(/Merchant Settlement Summary\s+([A-Z0-9][A-Z0-9 .&'-]{1,40})/i)
  const payoutOn = text.match(/Payout on\s+([^\n]+)/i)
  const period = text.match(/Transaction period\s+([^\n]+)/i)
  const reference = text.match(/Reference\s+([^\n]+)/i)
  const merchantId = text.match(/Merchant ID\s+(\d+)/i)

  return {
    kind: 'settlement_summary',
    bank: 'capitec',
    paidOutZar,
    salesZar,
    commissionZar,
    vatZar,
    payoutOn: payoutOn ? payoutOn[1].trim() : null,
    period: period ? period[1].trim() : null,
    reference: reference ? reference[1].trim() : null,
    merchantId: merchantId ? merchantId[1] : null,
    merchant: merchant ? merchant[1].trim() : null,
    transactionCount: sales.length,
  }
}

export function capitecSettlementCopy(settlement: CapitecSettlement): { title: string; body: string } {
  const net = `R${settlement.paidOutZar.toFixed(2)}`
  const sales = settlement.salesZar > 0 ? ` Sales R${settlement.salesZar.toFixed(2)}` : ''
  const fee =
    settlement.commissionZar > 0 || settlement.vatZar > 0
      ? `, commission R${settlement.commissionZar.toFixed(2)}, VAT R${settlement.vatZar.toFixed(2)}`
      : ''
  const when = settlement.payoutOn ? ` on ${settlement.payoutOn}` : ''
  const ref = settlement.reference ? ` Reference ${settlement.reference}.` : ''
  return {
    title: 'Bank · Capitec paid out',
    body: `Capitec settlement paid out ${net}${when}.${sales}${fee}.${ref} zar_available opens on the net payout. Fees were deducted on settlement.`,
  }
}

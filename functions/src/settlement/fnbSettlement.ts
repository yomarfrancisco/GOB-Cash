/** FNB merchant settlement statement. Gross settled opens zar_available; fees are month-end. */

export type FnbSettlementTxn = {
  terminalId: string | null
  transactionDateTime: string | null
  cardMasked: string | null
  amountZar: number
  authCode: string | null
  uniqueRef: string | null
  commissionZar: number
  vatZar: number
}

export type FnbSettlement = {
  kind: 'fnb_settlement'
  bank: 'fnb'
  merchantNumber: string | null
  merchantName: string | null
  outletNumber: string | null
  terminalId: string | null
  statementDate: string | null
  settledGrossZar: number
  commissionZar: number
  vatZar: number
  /** Gross is paid to the merchant; fees billed month-end. */
  zarAvailableZar: number
  transactions: FnbSettlementTxn[]
}

function money(raw: string): number {
  const value = Number(raw.replace(/[\s,]/g, ''))
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0
}

export function parseFnbSettlement(text: string): FnbSettlement | null {
  if (!/Merchant Number:/i.test(text) || !/Settled Amount/i.test(text)) return null
  const merchantNumber = (text.match(/Merchant Number:\s*(\d+)/i) || [])[1] || null
  const merchantName = (text.match(/Merchant Name:\s*([^\n]+)/i) || [])[1]?.trim() || null
  const outletNumber = (text.match(/Outlet Number:\s*(\d+)/i) || [])[1] || null
  const statementDate = (text.match(/Statement Date:\s*([^\n]+)/i) || [])[1]?.trim() || null

  const settledMatch = text.match(/Settled Amount\s+([\d\s,]+\.\d{2})\s+([\d\s,]+\.\d{2})\s+([\d\s,]+\.\d{2})/i)
  const settledGrossZar = settledMatch ? money(settledMatch[1]) : 0
  const commissionZar = settledMatch ? money(settledMatch[2]) : 0
  const vatZar = settledMatch ? money(settledMatch[3]) : 0
  if (!(settledGrossZar > 0)) return null

  const transactions: FnbSettlementTxn[] = []
  // Rows span newlines in pdf text extraction; match amount + trailing commission/VAT near auth.
  const row =
    /(\d{8})\s+D\s+\d+\s+\d+\s+[A-Za-z0-9]+\s+(\d{14})\s+(\d{6}\*+\d{4})\s+CR\s+([\d,]+\.\d{2})[\s\S]*?(\d{6})\s+0\s+([\d\s]+)\s+(\d+)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})/gi
  for (const match of text.matchAll(row)) {
    const stamp = match[2]
    const when = stamp
      ? `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)} ${stamp.slice(8, 10)}:${stamp.slice(10, 12)}:${stamp.slice(12, 14)}`
      : null
    transactions.push({
      terminalId: match[1],
      transactionDateTime: when,
      cardMasked: match[3],
      amountZar: money(match[4]),
      authCode: match[5],
      uniqueRef: match[6].replace(/\s+/g, ''),
      commissionZar: money(match[8]),
      vatZar: money(match[9]),
    })
  }

  return {
    kind: 'fnb_settlement',
    bank: 'fnb',
    merchantNumber,
    merchantName,
    outletNumber,
    terminalId: transactions[0]?.terminalId || null,
    statementDate,
    settledGrossZar,
    commissionZar,
    vatZar,
    zarAvailableZar: settledGrossZar,
    transactions,
  }
}

export function fnbSettlementCopy(settlement: FnbSettlement): { title: string; body: string } {
  const gross = `R${settlement.settledGrossZar.toFixed(2)}`
  const fee =
    settlement.commissionZar > 0 || settlement.vatZar > 0
      ? ` Merchant fees R${settlement.commissionZar.toFixed(2)} + VAT R${settlement.vatZar.toFixed(2)} are billed month-end and are not deducted from this payout.`
      : ''
  const who = settlement.merchantName ? ` (${settlement.merchantName.trim()})` : ''
  const when = settlement.statementDate ? ` Statement ${settlement.statementDate}.` : ''
  return {
    title: `FNB settled ${gross}`,
    body: `FNB Merchant Services settled ${gross} gross to the merchant account${who}.${when}${fee} zar_available opens on the gross.`,
  }
}

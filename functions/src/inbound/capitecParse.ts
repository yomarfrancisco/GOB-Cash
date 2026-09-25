/** Capitec card-sale receipt. An approval is ZAR landing from a conversion. */

export type CapitecReceipt = {
  kind: 'conversion_receipt'
  bank: 'capitec'
  amountZar: number
  merchant: string | null
  cardLast4: string | null
  cardMasked: string | null
  status: 'approved' | 'declined' | 'unknown'
  transactionNumber: string | null
  authCode: string | null
  occurredAt: string | null
}

export function parseCapitecReceipt(text: string): CapitecReceipt | null {
  if (!/Authorization ID|Card sale/i.test(text)) return null
  const amountRaw = text.match(/R\s*(\d[\d\s]*\.\d{2})/)
  if (!amountRaw) return null
  const amountZar = Number(amountRaw[1].replace(/\s/g, ''))
  if (!Number.isFinite(amountZar) || amountZar <= 0) return null
  const status = /Status\s+DECLINED/i.test(text) ? 'declined' : /APPROVED/i.test(text) ? 'approved' : 'unknown'
  const card = text.match(/(\d{6}\*+\d{4})/)
  const merchant = text.match(/\n([A-Z][A-Z0-9 .&'-]{2,40})\s*\n+\s*R\s*\d/i)
  const date = text.match(/Date\s+(\d{2}\/\d{2}\/\d{4})/i)
  const time = text.match(/Time\s+(\d{2}:\d{2}:\d{2})/i)
  const txn = text.match(/Transaction\s+(\d{6,})/i)
  const auth = text.match(/Authorization ID\s+(\d+)/i)
  return {
    kind: 'conversion_receipt',
    bank: 'capitec',
    amountZar: Math.round(amountZar * 100) / 100,
    merchant: merchant ? merchant[1].trim() : null,
    cardLast4: card ? card[1].slice(-4) : null,
    cardMasked: card ? card[1] : null,
    status,
    transactionNumber: txn ? txn[1] : null,
    authCode: auth ? auth[1] : null,
    occurredAt: date ? `${date[1]}${time ? ` ${time[1]}` : ''}` : null,
  }
}

export function isCapitecSender(from: string | null): boolean {
  return Boolean(from && /@capitecbank\.co\.za>?$/i.test(from.trim()))
}

export function capitecNoticeCopy(receipt: CapitecReceipt): { title: string; body: string } {
  const amount = `R${receipt.amountZar.toFixed(2)}`
  const where = receipt.merchant ? ` at ${receipt.merchant}` : ''
  const card = receipt.cardLast4 ? ` on card ${receipt.cardLast4}` : ''
  const when = receipt.occurredAt ? `, ${receipt.occurredAt}` : ''
  const ref = receipt.transactionNumber ? ` Transaction ${receipt.transactionNumber}.` : ''
  const auth = receipt.authCode ? ` Auth ${receipt.authCode}.` : ''
  if (receipt.status === 'declined') {
    return {
      title: `Capitec declined ${amount}`,
      body: `Capitec declined ${amount}${where}${card}${when}.${ref}${auth} Declined, so the ZAR card is unchanged.`,
    }
  }
  return {
    title: `Capitec approved ${amount}`,
    body: `Capitec approved ${amount}${where}${card}${when}.${ref}${auth} This conversion adds ${amount} to the ZAR card.`,
  }
}

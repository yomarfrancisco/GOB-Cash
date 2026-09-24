/** Two FNB notices only. Spend reserves card float. A receipt records bank approval. */

export type FnbCardSpend = {
  kind: 'card_spend'
  amountZar: number
  merchant: string
  accountLast4: string
  cardLast4: string
  reservedOn: string | null
  status: 'reserved'
}

export type FnbConversionReceipt = {
  kind: 'conversion_receipt'
  amountZar: number
  merchant: string | null
  cardLast4: string | null
  cardMasked: string | null
  status: 'approved' | 'declined' | 'unknown'
  uti: string | null
  rrn: string | null
  authCode: string | null
  occurredAt: string | null
}

export type FnbEvent = FnbCardSpend | FnbConversionReceipt

const SPEND =
  /FNB\s*:-\)\s*R\s*([\d\s,]+(?:\.\d{2})?)\s+reserved for purchase\s*@\s*(.+?)\s+from Current a\/c\.\.(\d+)\s+using card\.\.(\d+)/i

export function parseZar(raw: string): number | null {
  const n = Number(raw.replace(/[\s,]/g, ''))
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100) / 100
}

export function parseFnbCardSpend(subject: string): FnbCardSpend | null {
  const match = subject.match(SPEND)
  if (!match) return null
  const amountZar = parseZar(match[1])
  if (amountZar == null) return null
  const when = subject.match(/(\d{1,2}[A-Za-z]{3}\s+\d{1,2}:\d{2})/)
  return {
    kind: 'card_spend',
    amountZar,
    merchant: match[2].trim(),
    accountLast4: match[3].slice(-4),
    cardLast4: match[4].slice(-4),
    reservedOn: when ? when[1] : null,
    status: 'reserved',
  }
}

export function parseFnbReceipt(text: string): FnbConversionReceipt | null {
  if (!/FNB Receipt/i.test(text)) return null
  const amount = text.match(/Total:\s*R\s*([\d\s,]+(?:\.\d{2})?)/i)
  const amountZar = amount ? parseZar(amount[1]) : null
  if (amountZar == null) return null
  const card = text.match(/(\d{6}\*+\d{4})/)
  const utiParts = text.match(/UTI:\s*([0-9a-f-]+)\s*([0-9a-f-]+)?/i)
  const uti = utiParts ? `${utiParts[1]}${utiParts[2] || ''}`.replace(/\s/g, '') : null
  const status = /Approved/i.test(text) ? 'approved' : /Declined/i.test(text) ? 'declined' : 'unknown'
  const date = text.match(/(\d{2}-\d{2}-\d{4})\s+(\d{2}:\d{2}:\d{2})/)
  const merchant = text.match(/\n([A-Z][A-Z0-9 .&'-]{2,40})\n\d{2}-\d{2}-\d{4}/)
  return {
    kind: 'conversion_receipt',
    amountZar,
    merchant: merchant ? merchant[1].trim() : null,
    cardLast4: card ? card[1].slice(-4) : null,
    cardMasked: card ? card[1] : null,
    status,
    uti,
    rrn: (text.match(/RRN:\s*([A-Za-z0-9]+)/) || [])[1] || null,
    authCode: (text.match(/Auth Code:\s*(\d+)/) || [])[1] || null,
    occurredAt: date ? `${date[1]} ${date[2]}` : null,
  }
}

export function isFnbSender(from: string | null): boolean {
  return Boolean(from && /@fnb\.co\.za>?$/i.test(from.trim()))
}

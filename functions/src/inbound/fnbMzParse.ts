/**
 * FNB Mozambique (ebanka@fnb.co.mz) authenticated email templates.
 * Interbank transfer confirmations are bank_transfer — not card events —
 * unless the body itself contains sufficient card identity.
 */

import { extractSenderEmail } from './bankAuth'
import type { BankEvidenceEventKind } from './bankEventKinds'

export type FnbMzBankTransfer = {
  kind: 'bank_transfer'
  eventType: BankEvidenceEventKind
  originatingEntity: string | null
  sourceAccount: string | null
  destinationNib: string | null
  amountMzn: number
  description: string | null
  bankReference: string | null
  occurredAt: string | null
  /** Only set when the message itself contains card identity (never inferred from sender alone). */
  cardLast4: string | null
}

export function isFnbMzSender(from: string | null): boolean {
  return extractSenderEmail(from) === 'ebanka@fnb.co.mz'
}

function parseMznAmount(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s/g, '')
  let normalised = cleaned
  if (/^\d{1,3}(\.\d{3})+,\d{2}$/.test(cleaned)) {
    normalised = cleaned.replace(/\./g, '').replace(',', '.')
  } else if (/^\d{1,3}(,\d{3})+(\.\d{2})$/.test(cleaned)) {
    normalised = cleaned.replace(/,/g, '')
  } else if (/^\d+,\d{2}$/.test(cleaned)) {
    normalised = cleaned.replace(',', '.')
  }
  const n = Number(normalised)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100) / 100
}

function looksLikeTransfer(text: string): boolean {
  return (
    /transfer[eê]ncia|interbanc[aá]ria|confirma[cç][aã]o\s+de\s+transfer|NIB\s*destino|destination\s*NIB|conta\s+a\s+creditar/i.test(
      text
    )
  )
}

function lineAfter(text: string, label: RegExp): string | null {
  const match = text.match(label)
  if (!match || match.index == null) return null
  const rest = text.slice(match.index + match[0].length)
  const line = rest
    .split(/\n/)
    .map((row) => row.trim())
    .find((row) => row.length > 1 && !/^mzn$/i.test(row))
  return line || null
}

function extractCardLast4FromBody(text: string): string | null {
  // Only explicit card identity in the body — never from sender association.
  const patterns = [
    /cart[aã]o\b[\s\S]{0,48}?(?:\*+|x+)\s*(\d{4})\b/i,
    /card\b[\s\S]{0,48}?(?:ending\s+)?(?:\*+|x+)?\s*(\d{4})\b/i,
    /(\d{6})\*+(\d{4})/,
    /\*{2,}\s*(\d{4})\b/,
  ]
  for (const re of patterns) {
    const match = text.match(re)
    if (!match) continue
    if (match[2]) return match[2]
    if (match[1] && match[1].length === 4) return match[1]
  }
  return null
}

/**
 * Parse FNB Mozambique interbank transfer confirmation.
 * Does not classify as a card transaction merely because the sender relates to BRICS/FNB.
 */
export function parseFnbMzBankTransfer(text: string, subject?: string | null): FnbMzBankTransfer | null {
  const blob = `${subject || ''}\n${text}`
  if (!looksLikeTransfer(blob)) return null
  const amountMatch =
    blob.match(
      /(?:valor|montante|amount|importe)\s*[:.]?\s*(?:MZN\s*)?(\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d{2})|\d+[.,]\d{2})/i
    ) || blob.match(/(\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d{2})|\d+[.,]\d{2})\s*MZN/i)
  if (!amountMatch) return null
  const amountMzn = parseMznAmount(amountMatch[1]!.replace(/\s/g, ''))
  if (amountMzn == null) return null

  const originatingEntity =
    lineAfter(blob, /(?:originador|ordenante|from\s*entity|cliente)\s*[:.]?\s*/i) ||
    (blob.match(/(?:À|A)\s+([A-Z][A-Z0-9 .,&'-]{2,60})/) || [])[1] ||
    null

  const sourceAccount =
    lineAfter(blob, /(?:conta\s*(?:origem|a\s*debitar|de\s*d[eé]bito)|source\s*account|debit\s*account)\s*[:.]?\s*/i) ||
    (blob.match(/(?:conta|account)\s*[:.]?\s*(\d{8,16})/i) || [])[1] ||
    null

  const destinationNib =
    lineAfter(blob, /(?:NIB\s*destino|destination\s*NIB|NIB)\s*[:.]?\s*/i) ||
    (blob.match(/\b(00\d{19,21})\b/) || [])[1] ||
    null

  const description =
    lineAfter(blob, /(?:descri[cç][aã]o|description|narrativa|motivo)\s*[:.]?\s*/i) || null

  const bankReference =
    (blob.match(/(?:refer[eê]ncia|reference|ref\.?|UTI)\s*[:#]?\s*([A-Z0-9\-]{6,})/i) || [])[1] || null

  const occurred =
    blob.match(
      /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})(?:\s+[àa]s?\s+|\s+|T)(\d{1,2}:\d{2}(?::\d{2})?)/i
    ) || null

  return {
    kind: 'bank_transfer',
    eventType: 'bank_transfer',
    originatingEntity: originatingEntity ? originatingEntity.slice(0, 120) : null,
    sourceAccount: sourceAccount ? sourceAccount.replace(/\s+/g, ' ').trim().slice(0, 40) : null,
    destinationNib: destinationNib ? destinationNib.replace(/\D/g, '') : null,
    amountMzn,
    description: description ? description.slice(0, 240) : null,
    bankReference,
    occurredAt: occurred ? `${occurred[1]} ${occurred[2]}` : null,
    cardLast4: extractCardLast4FromBody(blob),
  }
}

export function fnbMzTransferNoticeCopy(event: FnbMzBankTransfer): { title: string; body: string } {
  const amount = `${event.amountMzn.toLocaleString('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} MZN`
  const who = event.originatingEntity ? ` from ${event.originatingEntity}` : ''
  const nib = event.destinationNib ? ` to NIB …${event.destinationNib.slice(-4)}` : ''
  const ref = event.bankReference ? ` Ref ${event.bankReference}.` : ''
  return {
    title: 'Bank · FNB MZ transfer',
    body: `FNB Mozambique confirmed an interbank transfer of ${amount}${who}${nib}.${ref} Stored as bank_transfer — not a card purchase.`,
  }
}

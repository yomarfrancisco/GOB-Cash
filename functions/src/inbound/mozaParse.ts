/**
 * Moza Banco authenticated email templates.
 * Cash withdrawal (levantamento) is NOT a POS capture and must not emit usable-ZAR evidence.
 */

import { extractSenderEmail } from './bankAuth'
import type { BankEvidenceEventKind } from './bankEventKinds'

export type MozaCashWithdrawal = {
  kind: 'cash_withdrawal'
  eventType: BankEvidenceEventKind
  amountMzn: number
  occurredAt: string | null
  cardLast4: string | null
  bankReference: string | null
  contactReference: string | null
}

export function isMozaSender(from: string | null): boolean {
  return extractSenderEmail(from) === 'info@mozabanco.co.mz'
}

export function parseMznAmountLoose(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s/g, '')
  let normalised = cleaned
  if (/^\d{1,3}(\.\d{3})+,\d{2}$/.test(cleaned)) {
    normalised = cleaned.replace(/\./g, '').replace(',', '.')
  } else if (/^\d{1,3}(,\d{3})+(\.\d{2})$/.test(cleaned)) {
    normalised = cleaned.replace(/,/g, '')
  } else if (/^\d+,\d{2}$/.test(cleaned)) {
    normalised = cleaned.replace(',', '.')
  } else if (/^\d+\.\d{2}$/.test(cleaned)) {
    normalised = cleaned
  }
  const n = Number(normalised)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100) / 100
}

function looksLikeWithdrawal(text: string): boolean {
  return /levantamento|cash\s*withdraw|saque|ATM|levantou/i.test(text)
}

function extractCardLast4(text: string): string | null {
  const patterns = [
    /cart[aã]o\s*(?:n[ºo.]?\s*)?(?:\*+|x+|X+)?\s*(\d{4})\b/i,
    /card\s*(?:ending|n[ºo.]?\s*)?(?:\*+|x+)?\s*(\d{4})\b/i,
    /\*{2,}\s*(\d{4})\b/,
    /terminad[oa]\s*(?:em\s*)?(\d{4})\b/i,
  ]
  for (const re of patterns) {
    const match = text.match(re)
    if (match?.[1]) return match[1]
  }
  return null
}

function extractOccurredAt(text: string): string | null {
  const dt =
    text.match(
      /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})(?:\s+[àa]s?\s+|\s+|T)(\d{1,2}:\d{2}(?::\d{2})?)/i
    ) || text.match(/(\d{1,2}\s+[A-Za-zçÇ]{3,9}\.?\s+\d{2,4})(?:\s+|,\s*)(\d{1,2}:\d{2})/i)
  if (!dt) return null
  return `${dt[1]} ${dt[2]}`
}

function extractBankReference(text: string): string | null {
  const match =
    text.match(/(?:refer[eê]ncia|reference|ref\.?|n[ºo.]\s*opera[cç][aã]o)\s*[:#]?\s*([A-Z0-9\-\/]{5,})/i) ||
    text.match(/\b(MZ[- ]?\d{6,})\b/i)
  return match ? match[1]!.replace(/\s+/g, '') : null
}

function extractContactReference(text: string): string | null {
  const match =
    text.match(/(?:contacto|contact|linha)\s*[:#]?\s*([0-9\s]{6,})/i) ||
    text.match(/(?:call\s*center|apoio)\s*[:#]?\s*([0-9\s]{6,})/i)
  return match ? match[1]!.replace(/\s+/g, ' ').trim() : null
}

function extractAmountMzn(text: string): number | null {
  const labelled =
    text.match(
      /(?:valor|montante|amount|levantamento\s+de)\s*[:.]?\s*(?:MZN\s*)?(\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d{2})|\d+[.,]\d{2})/i
    ) || text.match(/(\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d{2})|\d+[.,]\d{2})\s*MZN/i)
  if (!labelled) return null
  return parseMznAmountLoose(labelled[1]!.replace(/\s/g, ''))
}

/**
 * Parse Moza cash withdrawal / levantamento.
 * Returns null when the body is not a withdrawal template.
 */
export function parseMozaCashWithdrawal(text: string, subject?: string | null): MozaCashWithdrawal | null {
  const blob = `${subject || ''}\n${text}`
  if (!looksLikeWithdrawal(blob)) return null
  if (!/MZN|metical/i.test(blob) && !/levantamento/i.test(blob)) return null
  const amountMzn = extractAmountMzn(blob)
  if (amountMzn == null) return null
  return {
    kind: 'cash_withdrawal',
    eventType: 'cash_withdrawal',
    amountMzn,
    occurredAt: extractOccurredAt(blob),
    cardLast4: extractCardLast4(blob),
    bankReference: extractBankReference(blob),
    contactReference: extractContactReference(blob),
  }
}

export function mozaWithdrawalNoticeCopy(event: MozaCashWithdrawal): { title: string; body: string } {
  const amount = `${event.amountMzn.toLocaleString('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} MZN`
  const card = event.cardLast4 ? ` on card ****${event.cardLast4}` : ''
  const when = event.occurredAt ? `, ${event.occurredAt}` : ''
  const ref = event.bankReference ? ` Ref ${event.bankReference}.` : ''
  return {
    title: 'Bank · Moza cash withdrawal',
    body: `Moza recorded a cash withdrawal of ${amount}${card}${when}.${ref} Stored as evidence only — not a POS capture or usable-ZAR credit.`,
  }
}

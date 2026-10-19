/**
 * Moza Banco authenticated email templates.
 * Cash withdrawal (levantamento) is NOT a POS capture and must not emit usable-ZAR evidence.
 * Foreign VISA purchase (compra estrangeiro) IS a POS swipe and emits usable-ZAR evidence.
 */

import { extractSenderEmail } from './bankAuth'
import type { BankEvidenceEventKind } from './bankEventKinds'

export type MozaCashWithdrawal = {
  kind: 'cash_withdrawal'
  eventType: BankEvidenceEventKind
  amountMzn: number
  occurredAt: string | null
  cardLast4: string | null
  /** Digits shown after "cartão" when longer than last4 (issuer ref). */
  cardToken: string | null
  bankReference: string | null
  contactReference: string | null
}

export type MozaCardPurchase = {
  kind: 'card_purchase'
  eventType: BankEvidenceEventKind
  amountZar: number
  amountMzn: number | null
  occurredAt: string | null
  cardLast4: string | null
  /** Digits shown after "cartão" (e.g. 1120169). */
  cardToken: string | null
  terminalId: string | null
  merchant: string | null
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

function looksLikeForeignPurchase(text: string): boolean {
  return (
    /confirma[cç][aã]o\s+de\s+compra\s+visa\s+estrangeiro/i.test(text) ||
    (/compra/i.test(text) && /ZAR|R\s*\d/i.test(text) && /estrangeiro|visa|terminal/i.test(text)) ||
    (/registamos\s+uma\s+compra/i.test(text) && /ZAR/i.test(text))
  )
}

/**
 * Extract Moza "cartão …" token. Returns last4 for registry + full digit run when longer.
 * Example: "cartão 1120169" → token 1120169, last4 0169.
 */
function extractCardToken(text: string): { cardLast4: string | null; cardToken: string | null } {
  const long =
    text.match(/cart[aã]o\s*(?:n[ºo.]?\s*)?(?:\*+|x+|X+)?\s*(\d{5,19})\b/i) ||
    text.match(/card\s*(?:ending|n[ºo.]?\s*)?(?:\*+|x+)?\s*(\d{5,19})\b/i)
  if (long?.[1]) {
    const digits = long[1]!.replace(/\D/g, '')
    return { cardToken: digits, cardLast4: digits.slice(-4) }
  }
  const patterns = [
    /cart[aã]o\s*(?:n[ºo.]?\s*)?(?:\*+|x+|X+)?\s*(\d{4})\b/i,
    /card\s*(?:ending|n[ºo.]?\s*)?(?:\*+|x+)?\s*(\d{4})\b/i,
    /\*{2,}\s*(\d{4})\b/,
    /terminad[oa]\s*(?:em\s*)?(\d{4})\b/i,
  ]
  for (const re of patterns) {
    const match = text.match(re)
    if (match?.[1]) return { cardLast4: match[1], cardToken: match[1] }
  }
  return { cardLast4: null, cardToken: null }
}

function extractOccurredAt(text: string): string | null {
  const dt =
    text.match(
      /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})(?:\s*,?\s*[àa]s?\s+|\s*,\s*|\s+|T)(\d{1,2}:\d{2}(?::\d{2})?)/i
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
    text.match(/(?:call\s*center|apoio)\s*[:#]?\s*([0-9\s]{6,})/i) ||
    text.match(/mais\s+info\s+([0-9\/\s]+)/i)
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

/** "10.500,00 ZAR (43.748,54 MZN)" or labelled ZAR amount. */
function extractPurchaseAmounts(text: string): { amountZar: number; amountMzn: number | null } | null {
  const paired = text.match(
    /(\d{1,3}(?:\.\d{3})*(?:,\d{2})|\d+,\d{2})\s*ZAR\s*\((\d{1,3}(?:\.\d{3})*(?:,\d{2})|\d+,\d{2})\s*MZN\)/i
  )
  if (paired) {
    const amountZar = parseMznAmountLoose(paired[1]!)
    const amountMzn = parseMznAmountLoose(paired[2]!)
    if (amountZar == null) return null
    return { amountZar, amountMzn }
  }
  const zarOnly =
    text.match(/(\d{1,3}(?:\.\d{3})*(?:,\d{2})|\d+,\d{2})\s*ZAR\b/i) ||
    text.match(/(?:valor|montante|amount)\s*[:.]?\s*(?:de\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{2})|\d+,\d{2})\s*ZAR/i)
  if (!zarOnly) return null
  const amountZar = parseMznAmountLoose(zarOnly[1]!)
  if (amountZar == null) return null
  const mznSide = text.match(/\((\d{1,3}(?:\.\d{3})*(?:,\d{2})|\d+,\d{2})\s*MZN\)/i)
  return { amountZar, amountMzn: mznSide ? parseMznAmountLoose(mznSide[1]!) : null }
}

function extractTerminal(text: string): { terminalId: string | null; merchant: string | null } {
  const match = text.match(/terminal\s+(\d{6,})(?:\s*[-–—]\s*|\s+)([^\n.]+?)(?:\.|$)/i)
  if (!match) return { terminalId: null, merchant: null }
  const terminalId = match[1]!
  const merchant = match[2]!.replace(/\s+/g, ' ').trim() || null
  return { terminalId, merchant }
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
  const card = extractCardToken(blob)
  return {
    kind: 'cash_withdrawal',
    eventType: 'cash_withdrawal',
    amountMzn,
    occurredAt: extractOccurredAt(blob),
    cardLast4: card.cardLast4,
    cardToken: card.cardToken,
    bankReference: extractBankReference(blob),
    contactReference: extractContactReference(blob),
  }
}

/**
 * Parse Moza foreign VISA purchase confirmation (POS swipe in ZA).
 * Emits usable-ZAR evidence — not a cashZAR wallet credit.
 */
export function parseMozaCardPurchase(text: string, subject?: string | null): MozaCardPurchase | null {
  const blob = `${subject || ''}\n${text}`
  if (looksLikeWithdrawal(blob) && !looksLikeForeignPurchase(blob)) return null
  if (!looksLikeForeignPurchase(blob)) return null
  const amounts = extractPurchaseAmounts(blob)
  if (!amounts) return null
  const card = extractCardToken(blob)
  const terminal = extractTerminal(blob)
  return {
    kind: 'card_purchase',
    eventType: 'card_purchase',
    amountZar: amounts.amountZar,
    amountMzn: amounts.amountMzn,
    occurredAt: extractOccurredAt(blob),
    cardLast4: card.cardLast4,
    cardToken: card.cardToken,
    terminalId: terminal.terminalId,
    merchant: terminal.merchant,
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

export function mozaPurchaseNoticeCopy(event: MozaCardPurchase): { title: string; body: string } {
  const zar = `R${event.amountZar.toLocaleString('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
  const mzn =
    event.amountMzn != null
      ? ` (${event.amountMzn.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MZN)`
      : ''
  const card = event.cardLast4 ? ` on ****${event.cardLast4}` : ''
  const where = event.merchant ? ` at ${event.merchant}` : event.terminalId ? ` terminal ${event.terminalId}` : ''
  const when = event.occurredAt ? `, ${event.occurredAt}` : ''
  return {
    title: 'Bank · Moza VISA purchase',
    body: `Moza confirmed a foreign VISA purchase of ${zar}${mzn}${card}${where}${when}. Registered as processed ZAR (POS swipe evidence).`,
  }
}

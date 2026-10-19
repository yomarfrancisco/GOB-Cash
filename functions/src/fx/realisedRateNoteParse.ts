/**
 * Lightweight parse for Resend / Cursor notes that are not full bank templates.
 * Typical: balance-photo deltas or a short "Moza R10500 / 43748.54 MZN" mail.
 */

import { parseMznAmountLoose } from '../inbound/mozaParse'
import { normalizeIssuingBankId, type IssuingBankId, type RealisedRateSource } from './realisedRates'

export type RealisedRateNote = {
  bankId: IssuingBankId
  issuingBankHint: string | null
  amountZar: number
  amountMzn: number
  source: RealisedRateSource
  observedAtHint: string | null
  notes: string | null
}

function looksLikeRateNote(blob: string): boolean {
  return (
    /realis[ee]d\s*rate|fx\s*rate|balance\s*(photo|delta|change)|rate\s*observation/i.test(blob) ||
    (/MZN/i.test(blob) && /ZAR|R\s*\d/i.test(blob) && /moza|bci|bim|fnb|standard/i.test(blob))
  )
}

function detectBank(blob: string): { bankId: IssuingBankId; hint: string | null } {
  if (/moza/i.test(blob)) return { bankId: 'moza', hint: 'Moza Banco' }
  if (/millennium|\bBIM\b/i.test(blob)) return { bankId: 'bim', hint: 'Millennium BIM' }
  if (/standard/i.test(blob)) return { bankId: 'standard_mz', hint: 'Standard Bank Mozambique' }
  if (/\bFNB\b/i.test(blob)) return { bankId: 'fnb_mz', hint: 'FNB Mozambique' }
  if (/\bBCI\b/i.test(blob)) return { bankId: 'bci', hint: 'BCI' }
  return { bankId: normalizeIssuingBankId(blob), hint: null }
}

function extractPair(blob: string): { amountZar: number; amountMzn: number } | null {
  const paired = blob.match(
    /(\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d{2})|\d+[.,]\d{2}|\d+)\s*ZAR\s*[\/(]?\s*(\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d{2})|\d+[.,]\d{2})\s*MZN/i
  )
  if (paired) {
    const amountZar = parseMznAmountLoose(paired[1]!.replace(/\s/g, '')) || Number(paired[1]!.replace(/\s/g, ''))
    const amountMzn = parseMznAmountLoose(paired[2]!.replace(/\s/g, ''))
    if (amountZar && amountMzn) return { amountZar, amountMzn }
  }
  const zar =
    blob.match(/(?:ZAR|R)\s*[:=]?\s*(\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d{2})|\d+[.,]\d{2}|\d+)/i) ||
    blob.match(/(\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d{2})|\d+[.,]\d{2}|\d+)\s*ZAR\b/i)
  const mzn =
    blob.match(/MZN\s*[:=]?\s*(\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d{2})|\d+[.,]\d{2})/i) ||
    blob.match(/(\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d{2})|\d+[.,]\d{2})\s*MZN\b/i)
  if (!zar || !mzn) return null
  const amountZar = parseMznAmountLoose(zar[1]!.replace(/\s/g, '')) || Number(String(zar[1]).replace(/[^\d.]/g, ''))
  const amountMzn = parseMznAmountLoose(mzn[1]!.replace(/\s/g, ''))
  if (!(amountZar > 0) || amountMzn == null) return null
  return { amountZar, amountMzn }
}

/**
 * Parse a free-form rate note (email body, OCR text, or Cursor paste).
 * Returns null when the blob is not a rate observation.
 */
export function parseRealisedRateNote(text: string, subject?: string | null): RealisedRateNote | null {
  const blob = `${subject || ''}\n${text}`
  if (!looksLikeRateNote(blob)) return null
  const amounts = extractPair(blob)
  if (!amounts) return null
  const bank = detectBank(blob)
  const photo = /photo|screenshot|balance\s*(delta|change)|ocr/i.test(blob)
  const cursor = /cursor|manual\s*entry|agent/i.test(blob)
  const source: RealisedRateSource = photo ? 'balance_photo' : cursor ? 'cursor_manual' : 'operator_manual'
  const when =
    blob.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}(?:\s+[àa]s?\s+|\s+)\d{1,2}:\d{2}(?::\d{2})?)/i) ||
    blob.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?Z?)/)
  return {
    bankId: bank.bankId,
    issuingBankHint: bank.hint,
    amountZar: amounts.amountZar,
    amountMzn: amounts.amountMzn,
    source,
    observedAtHint: when ? when[1]! : null,
    notes: subject || null,
  }
}

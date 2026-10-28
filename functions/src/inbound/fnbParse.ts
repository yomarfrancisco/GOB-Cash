/** FNB ZA notices. Spend reserves card float. Receipts / POS credits add ZAR. */

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
  /** Present on generic merchant POS slips (Econometrica-style). */
  transactionNumber?: string | null
  declineReason?: string | null
  /** Desk copy bank label. Defaults to FNB for FNB Receipt slips. */
  noticeBank?: 'FNB' | 'POS'
}

/** Speedpoint / merchant POS payout credited into a current account. */
export type FnbPosCredit = {
  kind: 'pos_credit'
  amountZar: number
  accountLast4: string
  counterparty: string
  reference: string | null
  paidOn: string | null
  status: 'credited'
  cardLast4: null
}

export type FnbEvent = FnbCardSpend | FnbConversionReceipt | FnbPosCredit

const SPEND =
  /FNB\s*:-\)\s*R\s*([\d\s,]+(?:\.\d{2})?)\s+reserved for purchase\s*@\s*(.+?)\s+from Current a\/c\.\.(\d+)\s+using card\.\.(\d+)/i

/** e.g. FNB :-) R12000.00 paid to Current a/c..043559 @ Gts … Ref.Speedpoint67390368fn. 20Oct 04:31 */
const POS_CREDIT =
  /FNB\s*:-\)\s*R\s*([\d\s,]+(?:\.\d{2})?)\s+paid to Current a\/c\.\.(\d+)\s+@\s*(.+?)\.\s*(?:Ref\.([^\s.]+)\.\s*)?(\d{1,2}[A-Za-z]{3}\s+\d{1,2}:\d{2})/i

export function parseZar(raw: string): number | null {
  const n = Number(raw.replace(/[\s,]/g, ''))
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100) / 100
}

/**
 * Decline wins. Auth 000000 is a hard decline signal on FNB merchant slips.
 * Never treat footer "Authorised Financial Services" as an approval.
 */
export function classifyPosReceiptStatus(
  text: string,
  authCode: string | null = null
): 'approved' | 'declined' | 'unknown' {
  if (authCode != null && /^0+$/.test(authCode)) return 'declined'
  if (/\bStatus\s+DECLINED\b/i.test(text)) return 'declined'
  if (/\bCustomer Copy\s*\n+\s*Declined\b/i.test(text) || /\b\nDeclined\n/i.test(text)) return 'declined'
  if (/\bDeclined\b/i.test(text) && !/\bApproved\b/i.test(text)) return 'declined'
  if (/\bStatus\s+APPROVED\b/i.test(text)) return 'approved'
  if (/\bCustomer Copy\s*\n+\s*Approved\b/i.test(text) || /\b\nApproved\n/i.test(text)) return 'approved'
  // Bare "Approved" after Customer Copy — still require it is not a decline slip.
  if (/\bApproved\b/i.test(text) && !/\bDeclined\b/i.test(text)) return 'approved'
  if (/\bDeclined\b/i.test(text)) return 'declined'
  return 'unknown'
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

export function parseFnbPosCredit(subject: string): FnbPosCredit | null {
  const match = subject.match(POS_CREDIT)
  if (!match) return null
  const amountZar = parseZar(match[1])
  if (amountZar == null || amountZar <= 0) return null
  return {
    kind: 'pos_credit',
    amountZar,
    accountLast4: match[2].slice(-4),
    counterparty: match[3].replace(/\.\s*$/, '').trim(),
    reference: match[4] ? match[4].trim() : null,
    paidOn: match[5] ? match[5].trim() : null,
    status: 'credited',
    cardLast4: null,
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
  const authCode = (text.match(/Auth Code:\s*(\d+)/) || [])[1] || null
  const status = classifyPosReceiptStatus(text, authCode)
  const date = text.match(/(\d{2}-\d{2}-\d{4})\s+(\d{2}:\d{2}:\d{2})/)
  const merchant = text.match(/FNB Receipt\s+([A-Za-z][A-Za-z0-9 .&'-]{2,40})\s+\d{2}-\d{2}-\d{4}/i)
  return {
    kind: 'conversion_receipt',
    amountZar,
    merchant: merchant ? merchant[1].trim() : null,
    cardLast4: card ? card[1].slice(-4) : null,
    cardMasked: card ? card[1] : null,
    status,
    uti,
    rrn: (text.match(/RRN:\s*([A-Za-z0-9]+)/) || [])[1] || null,
    authCode,
    occurredAt: date ? `${date[1]} ${date[2]}` : null,
  }
}

/**
 * Generic SA merchant POS slip (e.g. Econometrica): Status DECLINED/APPROVED,
 * Transaction N, card mask — not FNB Receipt and not Capitec Authorization ID.
 */
export function parseMerchantPosReceipt(text: string): FnbConversionReceipt | null {
  if (/FNB Receipt/i.test(text)) return null
  if (/Authorization ID/i.test(text)) return null
  if (!/Status\s+(DECLINED|APPROVED)/i.test(text)) return null
  const amountRaw = text.match(/R\s*([\d\s]+(?:\.\d{2})?)/)
  const amountZar = amountRaw ? parseZar(amountRaw[1]) : null
  if (amountZar == null || amountZar <= 0) return null
  const card = text.match(/(\d{6}\*+\d{4})/)
  const txn = text.match(/Transaction\s+(\d{6,})/i)
  const date = text.match(/Date\s+(\d{2}\/\d{2}\/\d{4})/i)
  const time = text.match(/Time\s+(\d{2}:\d{2}:\d{2})/i)
  const merchant =
    text.match(/\n([A-Z][A-Z0-9 .&'-]{2,40})\s*\n+\s*R\s*\d/i) ||
    text.match(/\n([A-Z][A-Z0-9 .&'-]{2,40})\s*\n+\s*Description/i)
  const reason = text.match(/Declined\s*\n+\s*([A-Za-z][A-Za-z0-9 .,'-]{3,80})\s*\n+\s*Transaction/i)
  const authCode = (text.match(/Auth(?:orization)?(?:\s*Code|\s*ID)?\s*[:=]?\s*(\d+)/i) || [])[1] || null
  return {
    kind: 'conversion_receipt',
    amountZar,
    merchant: merchant ? merchant[1].trim() : null,
    cardLast4: card ? card[1].slice(-4) : null,
    cardMasked: card ? card[1] : null,
    status: classifyPosReceiptStatus(text, authCode),
    uti: null,
    rrn: txn ? txn[1] : null,
    authCode,
    occurredAt: date ? `${date[1]}${time ? ` ${time[1]}` : ''}` : null,
    transactionNumber: txn ? txn[1] : null,
    declineReason: reason ? reason[1].trim() : null,
    noticeBank: 'POS',
  }
}

export function isFnbSender(from: string | null): boolean {
  return Boolean(from && /@fnb\.co\.za>?$/i.test(from.trim()))
}

/** A Gmail forward keeps the FNB subject. The sender is no longer the bank. */
export function looksLikeFnbReceipt(subject: string | null): boolean {
  return /FNB Receipt|FNB-Txn-Notification|FNB Txn Notification|FNB\s+Txn/i.test(subject || '')
}

/** Generic merchant POS / decline PDF likely attached (Econometrica-style). */
export function looksLikeMerchantPosMail(subject: string | null): boolean {
  return /Txn|Transaction|POS|Declined|Receipt|Notification/i.test(subject || '')
}

export function bankNoticeCopy(
  event: FnbEvent,
  forwarded: boolean
): { title: string; body: string } {
  // Desk strips legacy "arrived directly / forwarded" provenance at display time;
  // new writes omit those sentences so group ledgers stay clean.
  void forwarded
  if (event.kind === 'card_spend') {
    const amount = `R${event.amountZar.toFixed(2)}`
    return {
      title: 'Bank · FNB reserved',
      body: `FNB reserved ${amount} on card ${event.cardLast4} at ${event.merchant}. Current account ending ${event.accountLast4}${event.reservedOn ? `, ${event.reservedOn}` : ''}.`,
    }
  }
  if (event.kind === 'pos_credit') {
    const amount = `R${event.amountZar.toFixed(2)}`
    const ref = event.reference ? ` Ref ${event.reference}.` : ''
    const when = event.paidOn ? ` ${event.paidOn}.` : ''
    return {
      title: 'Bank · FNB POS paid in',
      body: `FNB credited ${amount} to current account ending ${event.accountLast4} from ${event.counterparty}.${ref}${when}`,
    }
  }
  const bank = event.noticeBank === 'POS' ? 'POS' : 'FNB'
  const amount = `R${event.amountZar.toFixed(2)}`
  const where = event.merchant ? ` at ${event.merchant}` : ''
  const card = event.cardLast4 ? ` on card ${event.cardLast4}` : ''
  const refs = [event.authCode ? `auth ${event.authCode}` : '', event.rrn ? `RRN ${event.rrn}` : '']
    .filter(Boolean)
    .join(', ')
  const when = event.occurredAt ? `, ${event.occurredAt}` : ''
  const reason =
    event.declineReason && event.status === 'declined' ? ` Reason: ${event.declineReason}.` : ''
  if (event.status === 'declined') {
    return {
      title: `Bank · ${bank} declined`,
      body: `${bank} declined ${amount}${where}${card}${when}.${refs ? ` ${refs}.` : ''}${reason} Declined, so the ZAR card is unchanged.`,
    }
  }
  if (event.status === 'unknown') {
    return {
      title: `Bank · ${bank} receipt needs review`,
      body: `${bank} receipt for ${amount}${where}${card}${when} could not be classified as approved or declined.${refs ? ` ${refs}.` : ''} No ZAR was added.`,
    }
  }
  return {
    title: `Bank · ${bank} approved`,
    body: `${bank} approved ${amount}${where}${card}${when}.${refs ? ` ${refs}.` : ''}`,
  }
}

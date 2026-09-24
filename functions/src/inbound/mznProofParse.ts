/** Two screenshot layouts Mahomed sends as proof that MZN has landed. */

export type MznProof = {
  kind: 'mzn_received'
  amountMzn: number
  beneficiary: string | null
  operationNumber: string | null
  teiNumber: string | null
  debitAccount: string | null
  creditAccount: string | null
  layout: 'bank_transfer' | 'received_notice'
}

export function parseMznAmount(raw: string): number | null {
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

function lineAfter(text: string, label: RegExp): string | null {
  const match = text.match(label)
  if (!match || match.index == null) return null
  const rest = text.slice(match.index + match[0].length)
  const line = rest.split(/\n/).map((row) => row.trim()).find((row) => row.length > 1 && !/^mzn$/i.test(row))
  return line || null
}

function accountLine(text: string, label: RegExp): string | null {
  const line = lineAfter(text, label)
  if (!line) return null
  const digits = line.replace(/[^\d]/g, '')
  return digits.length >= 8 ? line.replace(/\s+/g, ' ').trim() : null
}

export function parseMznProof(text: string): MznProof | null {
  const received = /already been received|it'?s done/i.test(text)
  const transfer = /sucesso|operation successful|valor a transferir|transfer value/i.test(text)
  if (!received && !transfer) return null
  const amountRaw = text.match(/(\d{1,3}(?:[.,]\d{3})+[.,]\d{2}|\d+[.,]\d{2})\s*\n?\s*MZN/i)
  const amountMzn = amountRaw ? parseMznAmount(amountRaw[1]) : null
  if (amountMzn == null) return null
  const operation = text.match(/(?:N[uú]mero de opera[cç][aã]o|Operation number)\s*[\n:]*\s*(\d{5,})/i)
  const tei = text.match(/TEI order number\s*[\n:]*\s*(\d{5,})/i)
  let beneficiary: string | null = null
  if (received) {
    const named = text.match(/([A-Z][A-Z0-9 .,&'-]{2,60})\s+It has already been received/i)
    beneficiary = named ? named[1].trim() : null
  } else {
    beneficiary = lineAfter(text, /Titular da conta a creditar\s*/i)
  }
  return {
    kind: 'mzn_received',
    amountMzn,
    beneficiary,
    operationNumber: operation ? operation[1] : null,
    teiNumber: tei ? tei[1] : null,
    debitAccount: accountLine(text, /(?:^|\n)\s*(?:Conta a debitar|Debit account)\s*/i),
    creditAccount: accountLine(text, /(?:^|\n)\s*(?:Conta a creditar|Destination NIB)\s*/i),
    layout: received ? 'received_notice' : 'bank_transfer',
  }
}

export function mznNoticeCopy(proof: MznProof): { title: string; body: string } {
  const amount = `${proof.amountMzn.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MZN`
  const who = proof.beneficiary ? ` for ${proof.beneficiary}` : ''
  const ref = proof.operationNumber ? ` Operation ${proof.operationNumber}.` : ''
  return {
    title: `${amount} received`,
    body: `${amount} received${who}.${ref} This is a screenshot of a successful transfer, so MZN liquidity goes up by that amount.`,
  }
}

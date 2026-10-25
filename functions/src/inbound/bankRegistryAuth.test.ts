/**
 * Sanitized fixtures for Moza withdrawal + FNB MZ transfer.
 * Last-four only — no full PANs in fixtures, logs, or assertions.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buyerByCardLast4,
  canonicalCardIdByLast4,
  resolveBuyerCardLast4,
  resolveBuyerCardRef,
} from '../settlement/register'
import { evaluateBankAuthentication } from './bankAuth'
import {
  canEmitUsableZarEvidence,
  canSettlePosTicket,
  isCardLifecycleEvent,
} from './bankEventKinds'
import { parseMozaCardPurchase, parseMozaCashWithdrawal } from './mozaParse'
import { parseFnbMzBankTransfer } from './fnbMzParse'
import { extractMimeText } from './mimeText'

/** Sanitized Moza Banco cash withdrawal (levantamento). Last4 1707 only. */
export const FIXTURE_MOZA_WITHDRAWAL = `
Moza Banco — Notificação de Movimento
Caro Cliente,

Foi efectuado um levantamento (cash withdrawal) de 5.000,00 MZN
no cartão ****1707 em 12/10/2026 às 14:32.

Referência: MZ-20261012-88421
Contacto: 21 340 400

Este aviso é informativo. Guarde-o para os seus registos.
`.trim()

/** Sanitized Moza foreign VISA purchase (POS swipe). Issuer ref 1120169 → WolfMoza. */
export const FIXTURE_MOZA_VISA_PURCHASE = `
Moza Banco

Registamos uma compra no valor de 10.500,00 ZAR (43.748,54 MZN) em 19-10-2026, às 13:12:37, através do seu cartão 1120169, no terminal 0067379427- imani Johannesburg ZA. Mais info 95247/21342020.

O valor é teu.
Call Center: 822020 / 842020 / 21342020
`.trim()

/** Sanitized FNB Mozambique interbank transfer. No card digits in body. */
export const FIXTURE_FNB_MZ_TRANSFER = `
FNB Mozambique — Confirmação de Transferência Interbancária
From: ebanka@fnb.co.mz

Originador: BRICS AI, EI
Conta origem: 4829002310001
NIB destino: 001400009999887766551
Valor: 12.500,00 MZN
Descrição: Pagamento fornecedor Outubro
Referência: FNB-MZ-TRF-778812
Data: 12/10/2026 09:15

A transferência foi processada com sucesso.
`.trim()

/** Same transfer template but with explicit card identity in the body. */
export const FIXTURE_FNB_MZ_TRANSFER_WITH_CARD = `
${FIXTURE_FNB_MZ_TRANSFER}

Cartão associado ****8594
`.trim()

function authHeaders(domain: string, result = 'pass') {
  return {
    'Arc-Authentication-Results': `i=1; mx.google.com; dkim=${result} header.d=${domain}; spf=${result}`,
    'Authentication-Results': `mx.google.com; dkim=${result} header.d=${domain}`,
  }
}

describe('canonical card last-four registry', () => {
  it('maps 1707 → GoblinMoza', () => {
    assert.equal(canonicalCardIdByLast4('1707'), 'GoblinMoza')
    assert.equal(buyerByCardLast4('1707')?.deskCardId, 8)
    assert.equal(buyerByCardLast4('1707')?.payerFamilyId, 'goblin')
    assert.equal(buyerByCardLast4('1707')?.issuingBank, 'Moza Banco')
  })

  it('maps 1699 → WolfMoza', () => {
    assert.equal(canonicalCardIdByLast4('1699'), 'WolfMoza')
    assert.equal(buyerByCardLast4('1699')?.deskCardId, 7)
    assert.equal(buyerByCardLast4('1699')?.payerFamilyId, 'wolf')
    assert.equal(buyerByCardLast4('1699')?.issuingBank, 'Moza Banco')
  })

  it('maps 8594 → BRICS FNB (existing canonical id)', () => {
    assert.equal(canonicalCardIdByLast4('8594'), 'BRICS')
    assert.equal(buyerByCardLast4('8594')?.deskCardId, 1)
    assert.equal(buyerByCardLast4('8594')?.payerFamilyId, 'brics')
    assert.equal(buyerByCardLast4('8594')?.issuingBank, 'FNB Mozambique')
  })

  it('quarantines unknown last-four rather than guessing', () => {
    const unknown = resolveBuyerCardLast4('9999')
    assert.equal(unknown.ok, false)
    if (!unknown.ok) assert.equal(unknown.reason, 'unknown_last4')
    assert.equal(canonicalCardIdByLast4('9999'), null)
  })

  it('never stores a full PAN in Moza registry rows', () => {
    for (const last4 of ['1707', '1699', '8594']) {
      const buyer = buyerByCardLast4(last4)!
      assert.equal(buyer.cardLast4.length, 4)
      assert.equal(buyer.masked.includes(buyer.cardLast4), true)
      assert.equal(/\d{13,19}/.test(buyer.masked), false)
      assert.equal(buyer.cardBin6 == null || buyer.cardBin6.length === 6, true)
    }
  })
})

describe('Moza cash withdrawal parse', () => {
  it('parses sanitized levantamento and links 1707 without settling POS', () => {
    const event = parseMozaCashWithdrawal(FIXTURE_MOZA_WITHDRAWAL, 'Notificação de Levantamento')
    assert.ok(event)
    assert.equal(event!.kind, 'cash_withdrawal')
    assert.equal(event!.eventType, 'cash_withdrawal')
    assert.equal(event!.amountMzn, 5000)
    assert.equal(event!.cardLast4, '1707')
    assert.equal(event!.bankReference, 'MZ-20261012-88421')
    assert.ok(event!.occurredAt)
    assert.equal(canSettlePosTicket(event!.eventType), false)
    assert.equal(canEmitUsableZarEvidence(event!.eventType), false)
    assert.equal(isCardLifecycleEvent(event!.eventType), false)
    const resolved = resolveBuyerCardLast4(event!.cardLast4)
    assert.equal(resolved.ok, true)
    if (resolved.ok) assert.equal(resolved.buyer.canonicalCardId, 'GoblinMoza')
  })
})

describe('Moza foreign VISA purchase parse', () => {
  it('parses ZAR/MZN/terminal and registers usable ZAR on WolfMoza via issuer ref', () => {
    const event = parseMozaCardPurchase(FIXTURE_MOZA_VISA_PURCHASE, 'Confirmação de Compra VISA Estrangeiro')
    assert.ok(event)
    assert.equal(event!.kind, 'card_purchase')
    assert.equal(event!.eventType, 'card_purchase')
    assert.equal(event!.amountZar, 10500)
    assert.equal(event!.amountMzn, 43748.54)
    assert.equal(event!.cardToken, '1120169')
    assert.equal(event!.cardLast4, '0169')
    assert.equal(event!.terminalId, '0067379427')
    assert.match(event!.merchant || '', /imani Johannesburg ZA/i)
    assert.ok(event!.occurredAt)
    assert.equal(canSettlePosTicket(event!.eventType), true)
    assert.equal(canEmitUsableZarEvidence(event!.eventType), true)
    assert.equal(isCardLifecycleEvent(event!.eventType), true)
    const resolved = resolveBuyerCardRef(event!.cardToken)
    assert.equal(resolved.ok, true)
    if (resolved.ok) {
      assert.equal(resolved.buyer.canonicalCardId, 'WolfMoza')
      assert.equal(resolved.buyer.cardLast4, '1699')
    }
    assert.equal(parseMozaCashWithdrawal(FIXTURE_MOZA_VISA_PURCHASE, 'Confirmação de Compra VISA Estrangeiro'), null)
  })
})

describe('FNB MZ bank transfer parse', () => {
  it('parses transfer without masquerading as a card event', () => {
    const event = parseFnbMzBankTransfer(FIXTURE_FNB_MZ_TRANSFER, 'Confirmação de Transferência')
    assert.ok(event)
    assert.equal(event!.kind, 'bank_transfer')
    assert.equal(event!.eventType, 'bank_transfer')
    assert.equal(event!.amountMzn, 12500)
    assert.equal(event!.originatingEntity, 'BRICS AI, EI')
    assert.equal(event!.sourceAccount, '4829002310001')
    assert.equal(event!.destinationNib, '001400009999887766551')
    assert.equal(event!.description, 'Pagamento fornecedor Outubro')
    assert.equal(event!.bankReference, 'FNB-MZ-TRF-778812')
    assert.equal(event!.cardLast4, null)
    assert.equal(isCardLifecycleEvent(event!.eventType), false)
    assert.equal(canSettlePosTicket(event!.eventType), false)
  })

  it('attaches 8594 only when the body contains card identity', () => {
    const event = parseFnbMzBankTransfer(FIXTURE_FNB_MZ_TRANSFER_WITH_CARD)
    assert.ok(event)
    assert.equal(event!.cardLast4, '8594')
    assert.equal(event!.kind, 'bank_transfer')
    assert.equal(isCardLifecycleEvent(event!.eventType), false)
  })
})

describe('bank email authentication gate', () => {
  it('accepts Moza allow-listed sender with aligned ARC/DKIM pass', () => {
    const result = evaluateBankAuthentication({
      from: 'Moza Banco <info@mozabanco.co.mz>',
      headers: authHeaders('mozabanco.co.mz'),
      authentication: { dkim: { result: 'pass' }, spf: { result: 'pass' }, dmarc: { result: 'pass' } },
    })
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.issuer, 'moza')
      assert.equal(result.senderEmail, 'info@mozabanco.co.mz')
      assert.equal(result.dkimDomain, 'mozabanco.co.mz')
    }
  })

  it('accepts Gmail-forwarded Moza with header.i=@mozabanco.co.mz ARC (array headers)', () => {
    const result = evaluateBankAuthentication({
      from: 'info@mozabanco.co.mz',
      headers: {
        'authentication-results': [
          'amazonses.com; spf=pass; dkim=pass header.i=@mozabanco.co.mz; dmarc=pass header.from=mozabanco.co.mz',
        ],
        'arc-authentication-results': [
          'i=2; mx.google.com; dkim=pass header.i=@mozabanco.co.mz header.s=s2048; spf=pass smtp.mailfrom=info@mozabanco.co.mz',
        ],
        'dkim-signature': 'v=1',
      },
      authentication: { dkim: 'pass', spf: 'pass', dmarc: 'pass' },
    })
    assert.equal(result.ok, true)
    if (result.ok) assert.equal(result.dkimDomain, 'mozabanco.co.mz')
  })

  it('accepts ebanka@fnb.co.mz with aligned DKIM', () => {
    const result = evaluateBankAuthentication({
      from: 'ebanka@fnb.co.mz',
      headers: authHeaders('fnb.co.mz'),
      authentication: { dkim: { result: 'pass' }, spf: { result: 'pass' }, dmarc: { result: 'pass' } },
    })
    assert.equal(result.ok, true)
    if (result.ok) assert.equal(result.issuer, 'fnb_mz')
  })

  it('accepts inContact@fnb.co.za with aligned DKIM', () => {
    const result = evaluateBankAuthentication({
      from: 'inContact@fnb.co.za',
      headers: authHeaders('fnb.co.za'),
      authentication: { dkim: 'pass', spf: 'pass', dmarc: 'pass' },
    })
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.issuer, 'fnb_za')
      assert.equal(result.senderEmail, 'incontact@fnb.co.za')
    }
  })

  it('accepts NoReplyTransReport@FNB.co.za with aligned DKIM', () => {
    const result = evaluateBankAuthentication({
      from: 'NoReplyTransReport@FNB.co.za',
      headers: authHeaders('fnb.co.za'),
      authentication: { dkim: 'pass', spf: 'pass', dmarc: 'pass' },
    })
    assert.equal(result.ok, true)
    if (result.ok) assert.equal(result.issuer, 'fnb_za')
  })

  it('quarantines spoofed From address even with a passing DKIM for another domain', () => {
    const result = evaluateBankAuthentication({
      from: 'spoof@evil.example',
      headers: authHeaders('mozabanco.co.mz'),
      authentication: { dkim: { result: 'pass' }, spf: { result: 'pass' }, dmarc: { result: 'pass' } },
    })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.reason, 'sender_not_allowlisted')
  })

  it('quarantines allow-listed sender when DKIM/ARC fails', () => {
    const result = evaluateBankAuthentication({
      from: 'info@mozabanco.co.mz',
      headers: authHeaders('mozabanco.co.mz', 'fail'),
      authentication: { dkim: { result: 'fail' }, spf: { result: 'pass' }, dmarc: { result: 'fail' } },
    })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.reason, 'dkim_arc_failed')
  })

  it('quarantines allow-listed sender when DKIM domain is misaligned', () => {
    const result = evaluateBankAuthentication({
      from: 'info@mozabanco.co.mz',
      headers: authHeaders('unrelated.example'),
      authentication: { dkim: { result: 'pass' }, spf: { result: 'pass' }, dmarc: { result: 'pass' } },
    })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.reason, 'dkim_domain_misaligned')
  })
})

describe('fixture hygiene', () => {
  it('fixtures contain no full PAN sequences', () => {
    const blob = [
      FIXTURE_MOZA_WITHDRAWAL,
      FIXTURE_MOZA_VISA_PURCHASE,
      FIXTURE_FNB_MZ_TRANSFER,
      FIXTURE_FNB_MZ_TRANSFER_WITH_CARD,
    ].join('\n')
    // Account / NIB digits may appear; card identity must stay last-four or masked.
    assert.equal(/\b(?:478705|469617|428670|441279)\d{6,9}\d{4}\b/.test(blob), false)
    assert.equal(/\*{4}\d{4}/.test(blob), true)
    assert.equal(blob.includes('1707'), true)
    assert.equal(blob.includes('8594'), true)
  })

  it('MIME text extractor recovers plaintext bodies', () => {
    const raw = [
      'From: info@mozabanco.co.mz',
      'Content-Type: text/plain; charset=UTF-8',
      '',
      FIXTURE_MOZA_WITHDRAWAL,
    ].join('\r\n')
    const text = extractMimeText(raw)
    assert.equal(text.includes('levantamento'), true)
    assert.equal(text.includes('1707'), true)
  })
})

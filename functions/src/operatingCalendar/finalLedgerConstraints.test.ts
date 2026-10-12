import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  assignmentPreservesFinalCountBands,
  evaluateFinalDeskLedger,
  minCountForPos,
  maxCountForPos,
  capitecMinCount,
  lemonMaxCount,
} from './finalLedgerConstraints'
import type { TerminalId } from './operatingPolicyV1'
import type { LedgerPayment } from './finalLedgerConstraints'

function pay(partial: Partial<LedgerPayment> & { terminalId: TerminalId; amountZar: number }): LedgerPayment {
  return {
    invoiceId: partial.invoiceId || `INV-${partial.terminalId}`,
    economicPaymentId: partial.economicPaymentId || `PAY-${partial.terminalId}`,
    amountZar: partial.amountZar,
    date: partial.date || '2026-10-02',
    cardId: partial.cardId || 'BRICS',
    terminalId: partial.terminalId,
    merchantPrincipalId:
      partial.merchantPrincipalId ||
      (partial.terminalId === 'BricsFNB' || partial.terminalId === 'BricsCapitec'
        ? 'lemon_economics'
        : partial.terminalId === 'Imani'
          ? 'imani'
          : partial.terminalId === 'WolfFNB'
            ? 'wolf_and_sons'
            : 'econometrica'),
    acquirerBankId:
      partial.acquirerBankId ||
      (partial.terminalId === 'BricsCapitec' || partial.terminalId === 'Econometrica'
        ? 'capitec'
        : 'fnb'),
  }
}

describe('finalLedgerConstraints', () => {
  it('count floors for N=59 match acceptance shape', () => {
    assert.equal(minCountForPos('WolfFNB', 59), 9)
    assert.equal(minCountForPos('Econometrica', 59), 10)
    assert.equal(maxCountForPos(59), 20)
    assert.equal(lemonMaxCount(59), 20)
    assert.equal(capitecMinCount(59), 15)
  })

  it('lookahead rejects over-filling Lemon beyond 35%', () => {
    const counts = new Map<TerminalId, number>([
      ['WolfFNB', 10],
      ['Imani', 10],
      ['BricsFNB', 15],
      ['BricsCapitec', 5],
      ['Econometrica', 10],
    ])
    // 20 lemon already at max; another Lemon FNB must fail.
    assert.equal(
      assignmentPreservesFinalCountBands({
        totalN: 59,
        assignedCounts: counts,
        assignedSoFar: 50,
        nextTerminalId: 'BricsFNB',
      }),
      false
    )
  })

  it('evaluateFinalDeskLedger fails Lemon>35% and ECM under-floor', () => {
    const payments: LedgerPayment[] = []
    // Skewed ledger: Lemon heavy, ECM starved.
    for (let i = 0; i < 20; i++) payments.push(pay({ terminalId: 'BricsFNB', amountZar: 10_000, invoiceId: `L${i}` }))
    for (let i = 0; i < 15; i++) payments.push(pay({ terminalId: 'Imani', amountZar: 10_000, invoiceId: `I${i}` }))
    for (let i = 0; i < 15; i++) payments.push(pay({ terminalId: 'WolfFNB', amountZar: 10_000, invoiceId: `W${i}` }))
    for (let i = 0; i < 8; i++) payments.push(pay({ terminalId: 'BricsCapitec', amountZar: 10_000, invoiceId: `C${i}` }))
    for (let i = 0; i < 1; i++) payments.push(pay({ terminalId: 'Econometrica', amountZar: 10_000, invoiceId: `E${i}` }))
    const v = evaluateFinalDeskLedger(payments)
    assert.equal(v.ok, false)
    assert.ok(v.violations.some((x) => /Econometrica below floor/i.test(x)))
    assert.ok(v.violations.some((x) => /lemon_economics above 35%/i.test(x) || /BricsFNB above ceiling/i.test(x)))
  })

  it('pair/POS/card/principal tables must reconcile', () => {
    const payments = [
      pay({ terminalId: 'WolfFNB', amountZar: 10_000, cardId: 'Wolf', invoiceId: 'a' }),
      pay({ terminalId: 'Imani', amountZar: 10_000, cardId: 'Ginav', invoiceId: 'b' }),
      pay({ terminalId: 'BricsFNB', amountZar: 10_000, cardId: 'BRICS', invoiceId: 'c' }),
      pay({ terminalId: 'BricsCapitec', amountZar: 10_000, cardId: 'Vidrotec', invoiceId: 'd' }),
      pay({ terminalId: 'Econometrica', amountZar: 10_000, cardId: 'Goblin', invoiceId: 'e' }),
      pay({ terminalId: 'WolfFNB', amountZar: 10_000, cardId: 'Wolf', invoiceId: 'f' }),
      pay({ terminalId: 'Imani', amountZar: 10_000, cardId: 'Ginav', invoiceId: 'g' }),
    ]
    // 7 payments cannot satisfy 15% floors on 5 POS — expect fail, but reconcile counts match.
    const v = evaluateFinalDeskLedger(payments)
    assert.equal(v.byPos.reduce((s, r) => s + r.n, 0), 7)
    assert.equal(v.byPair.reduce((s, r) => s + r.n, 0), 7)
    assert.equal(v.ok, false)
  })
})

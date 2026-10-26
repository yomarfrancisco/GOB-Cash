/**
 * Offline dual-rail gate: mixed shock + EFT delay + card continues.
 * Must pass before live UI chips are trusted (plan Stage offline-gate).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { foldEvidence } from '../belief/fold'
import {
  evidenceFromAuthorisation,
  evidenceFromEftBankTransfer,
  evidenceFromEftDelayed,
  evidenceFromEftInstructed,
  evidenceFromZarAvailable,
} from '../belief/emitters'
import { buildDecisionRecord, assembleDecisionState } from '../belief/decision'
import {
  advanceEftBookPlannedDay,
  channelMixOf,
  defaultEftCorridorId,
  markOverdueEftTickets,
  mergeEftBook,
  openEftZar,
  splitReplacementChannels,
} from './channelSplit'
import { OPERATING_POLICY_V1 } from '../operatingCalendar/operatingPolicyV1'

const CORRIDOR = defaultEftCorridorId()
const NOW = Date.parse('2026-10-20T10:00:00+02:00')

describe('dual-rail offline gate', () => {
  it('mixed R100k shock keeps full EN ROUTE and does not pack only cards', () => {
    const split = splitReplacementChannels({ amountZar: 100_000, nowMs: NOW, shockId: 'mix-100' })
    assert.equal(split.enRouteZar, 100_000)
    assert.equal(channelMixOf(split), 'mixed')
    assert.ok(split.eftZar >= 50_000)
    assert.ok(split.cardTickets.every((t) => t.amountZar <= OPERATING_POLICY_V1.payment.maxAmountZar))
    const book = mergeEftBook(null, split)
    assert.equal(openEftZar(book), split.eftZar)
  })

  it('EFT delay does not clear the card lane or invent card settlement', () => {
    const split = splitReplacementChannels({ amountZar: 100_000, nowMs: NOW, shockId: 'delay-1' })
    let book = mergeEftBook(null, split)

    // Card POS still succeeds on its own evidence.
    const cardAuth = evidenceFromAuthorisation({
      merchantPrincipalId: 'imani_beauty',
      cardId: '4',
      cardIssuerBankId: 'bci',
      posTerminalId: '2',
      acquirerBankId: 'fnb',
      channel: 'card',
      requestedZar: 12_000,
      eventAt: '2026-10-20T11:00:00.000Z',
      economicPaymentId: 'card-pay-1',
    })
    const cardSettle = evidenceFromZarAvailable({
      merchantPrincipalId: 'imani_beauty',
      cardId: '4',
      cardIssuerBankId: 'bci',
      posTerminalId: '2',
      acquirerBankId: 'fnb',
      channel: 'card',
      requestedZar: 12_000,
      settledZar: 12_000,
      eventAt: '2026-10-20T12:00:00.000Z',
      settledAt: '2026-10-20T12:00:00.000Z',
      economicPaymentId: 'card-pay-1',
    })

    const eftTicket = split.eftTickets[0]!
    const instructed = evidenceFromEftInstructed({
      eftCorridorId: CORRIDOR,
      cardIssuerBankId: 'fnb_mozambique',
      economicPaymentId: eftTicket.economicPaymentId,
      requestedZar: eftTicket.amountZar,
      eventAt: eftTicket.instructedAt,
    })
    // Force overdue past hard T+2.
    const overdueMs = Date.parse(eftTicket.expectedSettledBy) + 60_000
    const marked = markOverdueEftTickets(book, overdueMs)
    book = marked.book
    assert.ok(marked.overdue.length >= 1)
    const delayed = evidenceFromEftDelayed({
      eftCorridorId: CORRIDOR,
      cardIssuerBankId: 'fnb_mozambique',
      economicPaymentId: eftTicket.economicPaymentId,
      requestedZar: eftTicket.amountZar,
      eventAt: new Date(overdueMs).toISOString(),
      overdueDeadlineAt: eftTicket.expectedSettledBy,
    })

    const beliefs = foldEvidence(
      [cardAuth, cardSettle, instructed, delayed],
      new Date(overdueMs).toISOString()
    )
    const cardCell = beliefs.find((b) => b.beliefKey === 'card:4')
    const eftCell = beliefs.find((b) => b.beliefKey === `eft:${CORRIDOR}`)
    assert.ok(cardCell, 'card belief exists')
    assert.ok((cardCell!.largestRecentSuccessfulTicketZar ?? 0) >= 12_000)
    assert.ok(eftCell, 'eft corridor belief exists')
    assert.equal(eftCell!.reviewState, 'delayed')
    // Card success must not inflate EFT ticket size belief.
    assert.ok(
      (eftCell!.largestRecentSuccessfulTicketZar ?? 0) === 0 ||
        eftCell!.largestRecentSuccessfulTicketZar == null
    )
    // Open EFT still pending after delay mark.
    assert.ok(openEftZar(book) > 0)
  })

  it('Planned multi-day EFT advance can settle while card ticks remain independent', () => {
    const split = splitReplacementChannels({ amountZar: 1_000_000, nowMs: NOW, shockId: 'r1m' })
    assert.ok(split.eftZar > 700_000)
    let book = mergeEftBook(null, split)
    // Day 0 Planned: open → submitted
    let adv = advanceEftBookPlannedDay(book, NOW)
    book = adv.book
    assert.ok(adv.steps.some((s) => s.startsWith('eft-submit:')))
    assert.equal(openEftZar(book), split.eftZar)
    // Jump past T+2 → settle
    const hardDue = Date.parse(split.eftTickets[0]!.expectedSettledBy)
    adv = advanceEftBookPlannedDay(book, hardDue + 3_600_000)
    book = adv.book
    assert.ok(adv.settledZar > 0)
    assert.ok(adv.steps.some((s) => s.startsWith('eft-settle:')))

    const settledEv = evidenceFromEftBankTransfer({
      eftCorridorId: CORRIDOR,
      cardIssuerBankId: 'fnb_mozambique',
      economicPaymentId: split.eftTickets[0]!.economicPaymentId,
      requestedZar: split.eftTickets[0]!.amountZar,
      settledZar: split.eftTickets[0]!.amountZar,
      eventAt: new Date(hardDue).toISOString(),
      source: 'simulation',
    })
    const beliefs = foldEvidence([settledEv], new Date(hardDue).toISOString())
    const eftCell = beliefs.find((b) => b.beliefKey === `eft:${CORRIDOR}`)
    assert.ok(eftCell)
    assert.ok((eftCell!.largestRecentSuccessfulTicketZar ?? 0) >= split.eftTickets[0]!.amountZar)
    // No card×POS cell created from EFT settle.
    assert.equal(
      beliefs.some((b) => b.beliefKey.startsWith('card:') || b.beliefKey.startsWith('pos:')),
      false
    )
  })

  it('DecisionRecord can carry mixed channelActions without silent card→EFT fallback', () => {
    const split = splitReplacementChannels({ amountZar: 100_000, nowMs: NOW, shockId: 'dec-1' })
    const state = assembleDecisionState({
      evidence: [],
      usableZar: split.cardZar,
      pendingExposureZar: split.eftZar,
      authorisedResidualZar: split.enRouteZar,
      asOf: new Date(NOW).toISOString(),
    })
    const decision = buildDecisionRecord({
      policyId: 'dual_rail_control',
      policyVersion: '1',
      state,
      action: {
        kind: 'execute',
        amountZar: split.cardZar,
        cardId: null,
        posTerminalId: null,
        issuerAcquirerPairId: null,
        invoiceId: null,
        economicPaymentId: split.cardTickets[0]?.economicPaymentId || null,
        legalCheckPass: true,
        channel: 'card',
      },
      channelActions: [
        {
          channel: 'card',
          amountZar: split.cardZar,
          economicPaymentId: split.cardTickets[0]?.economicPaymentId || null,
          expectedSettledBy: split.cardTickets[0]?.expectedSettledBy || null,
        },
        {
          channel: 'eft',
          amountZar: split.eftZar,
          economicPaymentId: split.eftTickets[0]?.economicPaymentId || null,
          expectedSettledBy: split.eftTickets[0]?.expectedSettledBy || null,
        },
      ],
      explanationFacts: [
        { kind: 'inference', text: split.summary },
        { kind: 'inference', text: 'Channel chosen at booking — no silent card→EFT fallback.' },
      ],
    })
    assert.equal(decision.action.channel, 'card')
    assert.equal(decision.channelActions?.length, 2)
    assert.ok(decision.channelActions!.some((s) => s.channel === 'eft'))
  })
})

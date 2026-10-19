import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildRealisedRateObservation,
  defaultConfidenceForSource,
  normalizeIssuingBankId,
  parseObservedAtLoose,
} from './realisedRates'

describe('realisedRates', () => {
  it('builds Moza observation with premium vs BCI and margin compression', () => {
    const row = buildRealisedRateObservation({
      issuingBank: 'Moza Banco',
      bankId: 'moza',
      amountZar: 10_500,
      amountMzn: 43_748.54,
      apiMid: 3.862405,
      source: 'moza_visa_email',
      observedAt: '2026-10-19T11:12:37.000Z',
      id: 'test-moza-10500',
    })
    assert.ok(Math.abs(row.effectiveRate - 43_748.54 / 10_500) < 1e-6)
    assert.equal(row.bciCostRate, 4.055525)
    assert.ok(Math.abs(row.sellRate - 4.461078) < 1e-5)
    assert.ok(row.bankPremiumVsBci > 0.027)
    assert.ok(row.marginOnCost < 0.1)
    assert.ok(Math.abs(row.marginOnBciCost - 0.1) < 1e-3)
    assert.equal(row.assumedCostMarkup, 1.05)
    assert.equal(row.confidence, 'high')
    assert.equal(row.bankId, 'moza')
  })

  it('marks balance photos and cursor manual as medium confidence by default', () => {
    assert.equal(defaultConfidenceForSource('balance_photo'), 'medium')
    assert.equal(defaultConfidenceForSource('cursor_manual'), 'medium')
    assert.equal(defaultConfidenceForSource('moza_visa_email'), 'high')
  })

  it('normalises issuing bank ids', () => {
    assert.equal(normalizeIssuingBankId('Moza Banco'), 'moza')
    assert.equal(normalizeIssuingBankId('FNB Mozambique'), 'fnb_mz')
    assert.equal(normalizeIssuingBankId('Standard Bank Mozambique'), 'standard_mz')
    assert.equal(normalizeIssuingBankId('Millennium BIM'), 'bim')
    assert.equal(normalizeIssuingBankId('BCI'), 'bci')
  })

  it('parses Moza occurredAt strings into ISO', () => {
    const iso = parseObservedAtLoose('19-10-2026 13:12:37')
    assert.ok(iso)
    assert.equal(iso!.startsWith('2026-10-19T'), true)
  })
})

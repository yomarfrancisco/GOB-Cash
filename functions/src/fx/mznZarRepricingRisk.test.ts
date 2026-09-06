import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  MIN_SAMPLE_COUNT,
  REPRICING_THRESHOLD_BPS,
  buildRiskSnapshot,
  deriveMznPerZar,
  hourlyPercentageChange,
  isThresholdBreach,
  observationPersistDecision,
  parseUsdLatestPayload,
  redactSecret,
  unavailableSnapshot,
  type HourlyMznZarObservation,
} from './mznZarRepricingRisk'

const HOUR = 60 * 60 * 1000

function obs(at: number, mznZar: number, extras: Partial<HourlyMznZarObservation> = {}): HourlyMznZarObservation {
  return {
    providerUpdatedAt: at,
    retrievedAt: at + 60_000,
    usdZar: 18,
    usdMzn: 18 * mznZar,
    mznZar,
    ...extras,
  }
}

describe('deriveMznPerZar', () => {
  it('calculates MZN per ZAR from USD/MZN ÷ USD/ZAR', () => {
    assert.equal(deriveMznPerZar(63.9, 18.1), 63.9 / 18.1)
  })

  it('rejects non-positive legs', () => {
    assert.equal(deriveMznPerZar(63.9, 0), null)
    assert.equal(deriveMznPerZar(-1, 18.1), null)
  })
})

describe('hourlyPercentageChange', () => {
  it('calculates abs((current / previous) - 1)', () => {
    assert.equal(hourlyPercentageChange(4.0, 4.02), Math.abs(4.02 / 4.0 - 1))
    assert.equal(hourlyPercentageChange(4.0, 3.98), Math.abs(3.98 / 4.0 - 1))
    assert.ok(Math.abs(hourlyPercentageChange(4.0, 4.02)! - 0.005) < 1e-12)
  })
})

describe('isThresholdBreach', () => {
  it('classifies a 50 bps move as a breach and 49 bps as not', () => {
    assert.equal(isThresholdBreach(0.005, 50), true)
    assert.equal(isThresholdBreach(0.0049, 50), false)
  })
})

describe('buildRiskSnapshot score', () => {
  it('is 100 × breach_count / valid_observation_count', () => {
    const start = Date.UTC(2026, 0, 1)
    const observations = [
      obs(start, 4.0),
      obs(start + HOUR, 4.03), // +0.75% breach
      obs(start + 2 * HOUR, 4.031), // +0.025% no
      obs(start + 3 * HOUR, 4.06), // +0.72% breach
    ]
    const snapshot = buildRiskSnapshot(observations, start + 3 * HOUR + 60_000, {
      minSampleCount: 1,
    })
    assert.equal(snapshot.sampleCount, 3)
    assert.equal(snapshot.breachCount, 2)
    assert.equal(snapshot.riskScore, (100 * 2) / 3)
    assert.equal(snapshot.thresholdBps, REPRICING_THRESHOLD_BPS)
    assert.equal(snapshot.dataStatus, 'ready')
  })
})

describe('duplicates and irregular spacing', () => {
  it('treats a repeated provider timestamp as a duplicate', () => {
    const observation = obs(1_700_000_000_000, 4.2)
    assert.equal(observationPersistDecision(observation, [observation.providerUpdatedAt]), 'duplicate')
    assert.equal(observationPersistDecision(observation, []), 'save')
  })

  it('does not count duplicate provider timestamps as extra zero-movement samples', () => {
    const start = Date.UTC(2026, 0, 1)
    const snapshot = buildRiskSnapshot(
      [obs(start, 4.0), obs(start, 4.0), obs(start + HOUR, 4.0)],
      start + HOUR + 60_000,
      { minSampleCount: 1 }
    )
    assert.equal(snapshot.sampleCount, 1)
    assert.equal(snapshot.breachCount, 0)
    assert.equal(snapshot.riskScore, 0)
  })

  it('excludes stale fetches and irregular gaps from the hourly score', () => {
    const start = Date.UTC(2026, 0, 1)
    const stale = observationPersistDecision(
      obs(start, 4.0, { retrievedAt: start + 3 * HOUR }),
      [],
      start + 3 * HOUR
    )
    assert.equal(stale, 'stale')

    const snapshot = buildRiskSnapshot(
      [
        obs(start, 4.0),
        obs(start + HOUR, 4.03),
        obs(start + 4 * HOUR, 4.1),
        obs(start + 5 * HOUR, 4.1),
      ],
      start + 5 * HOUR + 60_000,
      { minSampleCount: 1 }
    )
    assert.equal(snapshot.sampleCount, 2)
    assert.equal(snapshot.breachCount, 1)
    assert.equal(snapshot.riskScore, 50)
  })
})

describe('learning state', () => {
  it('stays learning until 48 valid hourly changes exist', () => {
    const start = Date.UTC(2026, 0, 1)
    const observations = Array.from({ length: 48 }, (_, i) => obs(start + i * HOUR, 4.0))
    const learning = buildRiskSnapshot(observations, start + 47 * HOUR + 60_000)
    assert.equal(learning.sampleCount, 47)
    assert.equal(learning.dataStatus, 'learning')
    assert.ok(learning.sampleCount < MIN_SAMPLE_COUNT)

    const readyObs = [...observations, obs(start + 48 * HOUR, 4.0)]
    const ready = buildRiskSnapshot(readyObs, start + 48 * HOUR + 60_000)
    assert.equal(ready.sampleCount, 48)
    assert.equal(ready.dataStatus, 'ready')
  })
})

describe('API failure handling', () => {
  it('marks the snapshot unavailable and redacts the API key', () => {
    const snapshot = unavailableSnapshot(1_700_000_000_000)
    assert.equal(snapshot.dataStatus, 'unavailable')
    assert.equal(snapshot.riskScore, 0)
    assert.equal(snapshot.providerUpdatedAt, null)

    const key = 're_secret_test_key'
    const redacted = redactSecret(`FX HTTP 401 https://v6.exchangerate-api.com/v6/${key}/latest/USD`, key)
    assert.equal(redacted.includes(key), false)
    assert.equal(redacted.includes('[redacted]'), true)
  })

  it('parses a USD latest payload without keeping unused fields', () => {
    const parsed = parseUsdLatestPayload(
      {
        result: 'success',
        time_last_update_unix: 1_700_000_000,
        conversion_rates: { ZAR: 18.1, MZN: 63.9 },
      },
      1_700_000_100_000
    )
    assert.ok(parsed)
    assert.equal(parsed?.usdZar, 18.1)
    assert.equal(parsed?.usdMzn, 63.9)
    assert.equal(parsed?.mznZar, 63.9 / 18.1)
    assert.equal(parsed?.providerUpdatedAt, 1_700_000_000_000)
  })
})

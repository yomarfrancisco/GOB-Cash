import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { absorbMznConvertDust, MZN_CONVERT_DUST } from './mznConvertDust'
import { roundMajor } from './reserveBooks'

describe('absorbMznConvertDust', () => {
  it('sweeps the Mt 0.01 leftover from round-trip ZAR cents', () => {
    const sellRate = 4.342291441950001
    const mznBalance = 10_000
    const wantZar = roundMajor(mznBalance / sellRate)
    const instantMzn = roundMajor(wantZar * sellRate)
    assert.equal(wantZar, 2302.93)
    assert.equal(instantMzn, 9999.99)
    assert.equal(roundMajor(mznBalance - instantMzn), 0.01)

    const out = absorbMznConvertDust({
      mznBalance,
      instantMzn,
      instantZar: wantZar,
    })
    assert.equal(out.instantMzn, 10_000)
    assert.equal(out.residualMzn, 0)
    assert.equal(out.mode, 'full')
  })

  it('keeps real queued residuals above the dust band', () => {
    const out = absorbMznConvertDust({
      mznBalance: 10_000,
      instantMzn: 5_000,
      instantZar: 1_000,
    })
    assert.equal(out.residualMzn, 5_000)
    assert.equal(out.mode, 'partial')
    assert.ok(out.residualMzn > MZN_CONVERT_DUST)
  })
})

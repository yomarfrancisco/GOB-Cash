import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { displayDeskBody, displayDeskTitle } from './deskCopy'

describe('desk copy display', () => {
  it('strips Day n of 14 from titles', () => {
    assert.equal(displayDeskTitle('Step 1 · Order · Day 9 of 14'), 'Step 1 · Order')
    assert.equal(displayDeskTitle('Step 5 · Recycle · Day 2 recycle'), 'Step 5 · Recycle')
    assert.equal(displayDeskTitle('Step 4 · Send · Day 3 send'), 'Step 4 · Send')
  })

  it('strips leading Day n of 14 from bodies', () => {
    assert.equal(
      displayDeskBody('Day 9 of 14.\nScheduled ZAR order: R20,178.19.'),
      'Scheduled ZAR order: R20,178.19.'
    )
  })
})

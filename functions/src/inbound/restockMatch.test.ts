import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mznCoversRestock, receiptsCoverRestock } from './restockMatch'

describe('restock receipt match', () => {
  it('accepts three whole-rand swipes around R8,230.42', () => {
    assert.equal(receiptsCoverRestock(8230.42, [2744, 2744, 2743]), true)
  })

  it('rejects a single receipt that is a different payment', () => {
    assert.equal(receiptsCoverRestock(8230.42, [10000]), false)
    assert.equal(receiptsCoverRestock(8230.42, [4000]), false)
  })

  it('treats a large MZN balance as cover for the restock', () => {
    assert.equal(mznCoversRestock(33800, 5_007_360, []), true)
    assert.equal(mznCoversRestock(33800, 1000, []), false)
  })
})

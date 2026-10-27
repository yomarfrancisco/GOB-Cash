import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { bankTileForTitle } from './bankTiles'

describe('bankTileForTitle', () => {
  it('maps Bank · titles to FNB / Capitec / Moza tiles', () => {
    assert.equal(bankTileForTitle('Bank · FNB approved')?.id, 'FNB')
    assert.equal(bankTileForTitle('Bank · FNB MZ transfer')?.label, 'FNB MZ')
    assert.equal(bankTileForTitle('Bank · Capitec paid out')?.id, 'Capitec')
    assert.equal(bankTileForTitle('Bank · Moza VISA purchase')?.id, 'Moza')
    assert.equal(bankTileForTitle('Bank · POS declined')?.id, 'POS')
  })

  it('ignores desk step titles and liaison cards', () => {
    assert.equal(bankTileForTitle('Step 3 · MZN'), null)
    assert.equal(bankTileForTitle('Step 1 · Order'), null)
    assert.equal(bankTileForTitle('ZAR booked'), null)
  })
})

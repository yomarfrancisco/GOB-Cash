import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { bankTileForTitle } from './bankTiles'

describe('bankTileForTitle', () => {
  it('maps Bank · titles to neutral acronym tiles', () => {
    assert.equal(bankTileForTitle('Bank · FNB approved')?.id, 'FNB')
    assert.equal(bankTileForTitle('Bank · FNB MZ transfer')?.label, 'FNB MZ')
    assert.equal(bankTileForTitle('Bank · Capitec paid out')?.acronym, 'CAP')
    assert.equal(bankTileForTitle('Bank · Moza VISA purchase')?.acronym, 'MOZA')
    assert.equal(bankTileForTitle('Bank · POS declined')?.id, 'POS')
    assert.equal(bankTileForTitle('Bank · BIM reply')?.acronym, 'BIM')
    assert.equal(bankTileForTitle('Bank · SBM reply')?.acronym, 'SBM')
    assert.equal(bankTileForTitle('Bank · Standard Bank reply')?.acronym, 'SBM')
    assert.equal(bankTileForTitle('Bank · BCI reply')?.acronym, 'BCI')
    assert.equal(bankTileForTitle('Bank · ABSA reply')?.acronym, 'ABSA')
    assert.equal(bankTileForTitle('Bank · Vista Bank reply')?.acronym, 'VISTA')
    assert.equal(bankTileForTitle('Bank · FNB approved')?.src, '/assets/ZAR_square.jpg')
  })

  it('ignores desk step titles and liaison cards', () => {
    assert.equal(bankTileForTitle('Step 3 · MZN'), null)
    assert.equal(bankTileForTitle('Step 1 · Order'), null)
    assert.equal(bankTileForTitle('ZAR booked'), null)
  })
})

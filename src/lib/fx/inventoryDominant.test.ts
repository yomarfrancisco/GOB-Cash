import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  defaultConversionDestination,
  inventoryDominantCard,
} from './inventoryDominant'

describe('inventoryDominant', () => {
  it('prefers MZN when Moz inventory is larger in ZAR terms', () => {
    assert.equal(inventoryDominantCard(1000, 100, 5), 'mzn')
    assert.equal(defaultConversionDestination(1000, 100, 5), 'ZAR')
  })

  it('prefers MZN when inventories are equal or both zero', () => {
    assert.equal(inventoryDominantCard(500, 100, 5), 'mzn')
    assert.equal(inventoryDominantCard(0, 0, 5), 'mzn')
    assert.equal(defaultConversionDestination(0, 0, 5), 'ZAR')
  })

  it('prefers ZAR only when Rand inventory is strictly larger', () => {
    assert.equal(inventoryDominantCard(400, 100, 5), 'savings')
    assert.equal(defaultConversionDestination(400, 100, 5), 'MZN')
  })
})

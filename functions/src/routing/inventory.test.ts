import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isForbiddenPair,
  resolveNamedCardIds,
  resolveNamedMachineIds,
  resolveNamedResources,
} from './inventory'

describe('named inventory', () => {
  it('maps spoken names without confusing Wolf the card with FNB Wolf', () => {
    assert.deepEqual(resolveNamedCardIds('Wolf is lost'), [5])
    assert.deepEqual(resolveNamedMachineIds('FNB Wolf is down'), [4])
    assert.deepEqual(resolveNamedResources('FNB Wolf is down'), { cardIds: [], machineIds: [4] })
    assert.deepEqual(resolveNamedMachineIds('Capitec is down'), [2])
    assert.deepEqual(resolveNamedCardIds('BRICS AI is unavailable'), [3])
  })

  it('keeps the identity pairing bans', () => {
    assert.equal(isForbiddenPair(3, 1), true)
    assert.equal(isForbiddenPair(3, 2), true)
    assert.equal(isForbiddenPair(5, 4), true)
    assert.equal(isForbiddenPair(3, 3), false)
    assert.equal(isForbiddenPair(5, 1), false)
  })
})

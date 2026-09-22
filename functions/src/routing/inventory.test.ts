import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isForbiddenPair,
  resolveNamedCardIds,
  resolveNamedMachineIds,
  resolveNamedResources,
} from './inventory'

describe('named inventory', () => {
  it('maps spoken names to kernel cards and rails', () => {
    assert.deepEqual(resolveNamedCardIds('Wolf is lost'), [4])
    assert.deepEqual(resolveNamedMachineIds('Rail 4 Capitec is down'), [4])
    assert.deepEqual(resolveNamedResources('Rail 2 FNB is down'), { cardIds: [], machineIds: [2] })
    assert.deepEqual(resolveNamedMachineIds('Capitec is down'), [4])
    assert.deepEqual(resolveNamedCardIds('BRICS is unavailable'), [1])
  })

  it('does not keep name-collision pairing bans; the kernel assigns whole tickets', () => {
    assert.equal(isForbiddenPair(1, 4), false)
    assert.equal(isForbiddenPair(2, 1), false)
    assert.equal(isForbiddenPair(3, 2), false)
  })
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('firestore routeEvidence protection', () => {
  it('denies client read/write on route evidence collections', () => {
    const rulesPath = join(process.cwd(), '..', 'firestore.rules')
    const rules = readFileSync(rulesPath, 'utf8')
    for (const name of [
      'routeEvidence',
      'routeEvidenceSim',
      'routeEvidenceQuarantine',
      'routeBeliefs',
      'decisionRecords',
    ]) {
      assert.ok(rules.includes(`match /${name}/{id}`), `missing match for ${name}`)
    }
    assert.ok(rules.includes('Route evidence: clients never create/update/delete'))
    // Explicit deny for clients; Admin SDK bypasses rules and uses create-only app code.
    assert.match(rules, /match \/routeEvidence\/\{id\}[\s\S]*?allow write: if false/)
  })
})
